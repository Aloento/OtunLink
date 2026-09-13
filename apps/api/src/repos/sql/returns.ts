// 退货单仓库（return_orders + return_order_items）：发货退货与零售售后退货。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateReturnRepoInput, CreateSalesReturnRepoInput, ReturnListQuery, ReturnListResult, ReturnOrderItemRecord, ReturnOrderRecord, ReturnRepository, SalesRepository, SalesReturnReceiveLineInput, ShipmentRepository } from '../../types';
import { ensureBatchNo } from '../../lib/batch';
import { mergeInboundLines } from '../inbound-lines';
import { RETURN_ALREADY_PROCESSED, RETURN_LINE_INVALID, RETURN_QTY_EXCEEDED, RETURN_STATE_CONFLICT, SALES_STATE_CONFLICT } from './errors';
import { nn, photoArray, quote, round2num } from './helpers';
import { insertDraftInbound } from './inbound-posting';
import { mapReturn, mapReturnItem } from './mappers';
import { nextInboundNo, nextReturnNo } from './sequences';

export function createReturnsRepo(
  exec: SqlExecutor,
  deps: {
    shipments: Pick<ShipmentRepository, 'findById' | 'listItems'>;
    sales: Pick<SalesRepository, 'findById' | 'listItems'>;
  },
): ReturnRepository {
  const { shipments, sales } = deps;
  const returns: ReturnRepository = {
    async list(query: ReturnListQuery): Promise<ReturnListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.status) parts.push(`${alias}status = ${quote(query.status)}`);
        if (query.sourceType) parts.push(`${alias}source_type = ${quote(query.sourceType)}`);
        if (query.salesOrderId) parts.push(`${alias}sales_order_id = ${quote(query.salesOrderId)}`);
        if (query.scopeUnitId) {
          parts.push(
           `(${alias}from_unit_id = ${quote(query.scopeUnitId)} OR ${alias}to_unit_id = ${quote(query.scopeUnitId)})`,
          );
        }
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM return_orders${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT ro.*, fu.name AS from_unit_name, tu.name AS to_unit_name, s.shipment_no,
                so.sales_no AS sales_order_no
         FROM return_orders ro
         LEFT JOIN business_units fu ON fu.id = ro.from_unit_id
         LEFT JOIN business_units tu ON tu.id = ro.to_unit_id
         LEFT JOIN shipments s ON s.id = ro.shipment_id
         LEFT JOIN sales_orders so ON so.id = ro.sales_order_id
         ${where('ro.')} ORDER BY ro.created_at DESC, ro.id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapReturn), total, page, size };
    },
    async findById(id: string): Promise<ReturnOrderRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM return_orders WHERE id = ${quote(id)} LIMIT 1`,
      );
      return rows[0] ? mapReturn(rows[0]) : null;
    },
    async listItems(returnOrderId: string): Promise<ReturnOrderItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT roi.*, i.name AS item_name, b.source_type AS original_batch_source_type
         FROM return_order_items roi
         LEFT JOIN items i ON i.id = roi.item_id
         LEFT JOIN batches b ON b.id = roi.original_batch_id
         WHERE roi.return_order_id = ${quote(returnOrderId)}
         ORDER BY roi.created_at ASC, roi.id ASC`,
      );
      return rows.map(mapReturnItem);
    },
    async createReturn(input: CreateReturnRepoInput): Promise<ReturnOrderRecord> {
      const shipment = await shipments.findById(input.shipmentId);
      if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
      if (shipment.status !== 'READY') throw new Error(RETURN_STATE_CONFLICT);

      const shipmentItems = await shipments.listItems(shipment.id);
      const byId = new Map(shipmentItems.map((i) => [i.id, i]));
      const lines: { shipmentItemId: string; itemId: string; qty: string; reason: string | null }[] = [];
      for (const line of input.lines) {
        const item = byId.get(line.shipmentItemId);
        if (!item || !item.itemId) throw new Error(RETURN_LINE_INVALID);
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0 || qty > Number(item.expectedQty)) {
          throw new Error(RETURN_LINE_INVALID);
        }
        lines.push({
          shipmentItemId: item.id,
          itemId: item.itemId,
          qty: qty.toFixed(2),
          reason: line.reason,
        });
      }
      if (lines.length === 0) throw new Error(RETURN_LINE_INVALID);

      const returnNo = await nextReturnNo(exec);
      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO return_orders
            (return_no, source_type, shipment_id, from_unit_id, to_unit_id, status,
             reason, note, photo_file_ids, return_carrier, return_tracking_no, created_by)
           VALUES (${quote(returnNo)}, 'SHIPMENT', ${quote(shipment.id)},
                  ${quote(shipment.receiverUnitId)}, ${quote(shipment.shipperUnitId)}, 'PENDING',
                  ${quote(nn(input.reason))}, ${quote(nn(input.note))}, ${photoArray(input.photoFileIds)},
                  ${quote(nn(input.returnCarrier))}, ${quote(nn(input.returnTrackingNo))},
                  ${quote(input.createdBy)})
           RETURNING *`,
        );
        const order = mapReturn(rows[0]);
        for (const line of lines) {
          await exec.query(
           `INSERT INTO return_order_items
              (return_order_id, item_id, shipment_item_id, qty, reason)
            VALUES (${quote(order.id)}, ${quote(line.itemId)}, ${quote(line.shipmentItemId)},
                    ${quote(line.qty)}, ${quote(nn(line.reason))})`,
          );
        }
        await exec.query(
          `UPDATE shipments SET status = 'RETURN_PENDING', updated_at = now()
           WHERE id = ${quote(shipment.id)} AND status = 'READY'`,
        );
        await exec.query('COMMIT');
        return order;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async accept(
      id: string,
      processedBy: string,
      note: string | null,
    ): Promise<ReturnOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM return_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapReturn(locked[0]);
        if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED);

        const shipment = order.shipmentId ? await shipments.findById(order.shipmentId) : null;
        if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');

        const { rows: itemRows } = await exec.query(
          `SELECT * FROM return_order_items WHERE return_order_id = ${quote(id)} ORDER BY id ASC`,
        );
        const returnItems = itemRows.map(mapReturnItem);
        const shipmentItems = await shipments.listItems(shipment.id);
        const returnedByShipmentItem = new Map<string, number>();
        for (const ri of returnItems) {
          if (ri.shipmentItemId) {
           returnedByShipmentItem.set(
             ri.shipmentItemId,
             (returnedByShipmentItem.get(ri.shipmentItemId) ?? 0) + Number(ri.qty),
           );
          }
        }
        const fullReturn = shipmentItems.every(
          (si) =>
           si.itemId !== null &&
           (returnedByShipmentItem.get(si.id) ?? 0) >= Number(si.expectedQty),
        );
        let shipmentStatus: 'RETURNED' | 'INBOUNDED';
        if (fullReturn) {
          shipmentStatus = 'RETURNED';
        } else {
          // 部分拒收：剩余数量自动建档 DRAFT 入库单（等待仓库 POST 过账）。
          const merged = mergeInboundLines(
           shipmentItems,
           (si) => {
             const returned = returnedByShipmentItem.get(si.id) ?? 0;
             const remaining = Number(si.expectedQty) - returned;
             return remaining > 0 ? remaining.toFixed(2) : null;
           },
           () => null,
           shipment.shipmentNo,
          );
          if (merged.length > 0) {
           const inboundNo = await nextInboundNo(exec);
           await insertDraftInbound(exec, {
             inboundNo,
             shipmentId: shipment.id,
             warehouseUnitId: shipment.receiverUnitId,
             counterpartyUnitId: shipment.shipperUnitId,
             remark: null,
             photoFileIds: [],
             createdBy: processedBy,
             lines: merged,
           });
          }
          shipmentStatus = 'INBOUNDED';
        }

        const { rows: updated } = await exec.query(
          `UPDATE return_orders
           SET status = 'CLOSED', processed_by = ${quote(processedBy)},
               processed_at = now(), processed_note = ${quote(nn(note))}, updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(RETURN_ALREADY_PROCESSED);
        await exec.query(
          `UPDATE shipments SET status = ${quote(shipmentStatus)}, updated_at = now()
           WHERE id = ${quote(shipment.id)} AND status = 'RETURN_PENDING'`,
        );
        await exec.query('COMMIT');
        return mapReturn(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async reject(
      id: string,
      processedBy: string,
      note: string,
    ): Promise<ReturnOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM return_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapReturn(locked[0]);
        if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED);

        const { rows: updated } = await exec.query(
          `UPDATE return_orders
           SET status = 'REJECTED', processed_by = ${quote(processedBy)},
               processed_at = now(), processed_note = ${quote(note)}, updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(RETURN_ALREADY_PROCESSED);
        if (order.shipmentId) {
          await exec.query(
           `UPDATE shipments SET status = 'READY', updated_at = now()
             WHERE id = ${quote(order.shipmentId)} AND status = 'RETURN_PENDING'`,
          );
        }
        await exec.query('COMMIT');
        return mapReturn(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async delete(id: string): Promise<boolean> {
      const existing = await this.findById(id);
      if (!existing) return false;
      if (existing.status !== 'PENDING' && existing.status !== 'REQUESTED') {
        throw new Error(RETURN_STATE_CONFLICT);
      }
      await exec.query('BEGIN');
      try {
        // SHIPMENT 来源且 PENDING：回退关联发货单 RETURN_PENDING → READY。
        if (existing.sourceType === 'SHIPMENT' && existing.status === 'PENDING' && existing.shipmentId) {
          await exec.query(
            `UPDATE shipments SET status = 'READY', updated_at = now()
             WHERE id = ${quote(existing.shipmentId)} AND status = 'RETURN_PENDING'`,
          );
        }
        const { rows } = await exec.query(
          `DELETE FROM return_orders WHERE id = ${quote(id)} RETURNING id`,
        );
        await exec.query('COMMIT');
        return rows.length > 0;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    // ── 零售售后退货（source_type=SALES）────────────────────────────────
    async createFromSales(input: CreateSalesReturnRepoInput): Promise<ReturnOrderRecord> {
      const order = await sales.findById(input.salesOrderId);
      if (!order) throw new Error('SALES_NOT_FOUND: sales order does not exist');
      if (
        order.status !== 'SENT' &&
        order.status !== 'PAYMENT_UPLOADED' &&
        order.status !== 'CONFIRMED'
      ) {
        throw new Error(SALES_STATE_CONFLICT);
      }

      const lines = await sales.listItems(order.id);
      const byId = new Map(lines.map((l) => [l.id, l]));
      // 可退数量 = 该行已发数量 − 已退数量（已退 = 非 CANCELLED 的 SALES 退货单申请量）。
      const returnedByLine = new Map<string, number>();
      if (lines.length > 0) {
        const { rows: returnedRows } = await exec.query(
          `SELECT roi.sales_order_item_id AS sid, SUM(roi.qty)::numeric AS returned
           FROM return_order_items roi
           JOIN return_orders ro ON ro.id = roi.return_order_id
           WHERE roi.sales_order_item_id = ANY(${photoArray(lines.map((l) => l.id))})
             AND ro.source_type = 'SALES' AND ro.status <> 'CANCELLED'
           GROUP BY roi.sales_order_item_id`,
        );
        for (const row of returnedRows) {
          returnedByLine.set(String(row.sid), Number(String(row.returned ?? '0')));
        }
      }

      // 行级合并（同一销售行允许多行，汇总后校验）。
      const requested = new Map<string, { qty: number; reason: string | null }>();
      for (const l of input.lines) {
        const item = byId.get(l.salesOrderItemId);
        if (!item) throw new Error(RETURN_LINE_INVALID);
        const qty = Number(l.qty);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(RETURN_LINE_INVALID);
        const prev = requested.get(item.id) ?? { qty: 0, reason: null };
        requested.set(item.id, {
          qty: round2num(prev.qty + qty),
          reason: l.reason ?? prev.reason,
        });
      }
      if (requested.size === 0) throw new Error(RETURN_LINE_INVALID);
      const finalLines: { salesOrderItemId: string; itemId: string; qty: string; reason: string | null }[] = [];
      for (const [lineId, req] of requested) {
        const item = byId.get(lineId)!;
        const returnable = round2num(Number(item.qty) - (returnedByLine.get(lineId) ?? 0));
        if (req.qty > returnable + 1e-9) throw new Error(RETURN_QTY_EXCEEDED);
        finalLines.push({
          salesOrderItemId: item.id,
          itemId: item.itemId,
          qty: req.qty.toFixed(2),
          reason: req.reason,
        });
      }

      const returnNo = await nextReturnNo(exec);
      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO return_orders
             (return_no, source_type, sales_order_id, from_unit_id, to_unit_id, status,
              reason, note, photo_file_ids, created_by)
           VALUES (${quote(returnNo)}, 'SALES', ${quote(order.id)},
                   ${quote(order.buyerUnitId)}, ${quote(order.sellerUnitId)}, 'REQUESTED',
                   ${quote(nn(input.reason))}, ${quote(nn(input.note))},
                   ${photoArray(input.photoFileIds)}, ${quote(input.createdBy)})
           RETURNING *`,
        );
        const created = mapReturn(rows[0]);
        for (const line of finalLines) {
          await exec.query(
            `INSERT INTO return_order_items
               (return_order_id, item_id, sales_order_item_id, qty, reason)
             VALUES (${quote(created.id)}, ${quote(line.itemId)}, ${quote(line.salesOrderItemId)},
                     ${quote(line.qty)}, ${quote(nn(line.reason))})`,
          );
        }
        await exec.query('COMMIT');
        return created;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async approveSales(
      id: string,
      processedBy: string,
      note: string | null,
    ): Promise<ReturnOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM return_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapReturn(locked[0]);
        if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT);
        if (order.status !== 'REQUESTED') throw new Error(RETURN_ALREADY_PROCESSED);
        const { rows: updated } = await exec.query(
          `UPDATE return_orders
           SET status = 'APPROVED', processed_by = ${quote(processedBy)},
               processed_at = now(), processed_note = ${quote(nn(note))}, updated_at = now()
           WHERE id = ${quote(id)} AND status = 'REQUESTED' RETURNING *`,
        );
        if (!updated[0]) throw new Error(RETURN_ALREADY_PROCESSED);
        await exec.query('COMMIT');
        return mapReturn(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async rejectSales(
      id: string,
      processedBy: string,
      note: string,
    ): Promise<ReturnOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM return_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapReturn(locked[0]);
        if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT);
        if (order.status !== 'REQUESTED') throw new Error(RETURN_ALREADY_PROCESSED);
        const { rows: updated } = await exec.query(
          `UPDATE return_orders
           SET status = 'CANCELLED', processed_by = ${quote(processedBy)},
               processed_at = now(), processed_note = ${quote(note)}, updated_at = now()
           WHERE id = ${quote(id)} AND status = 'REQUESTED' RETURNING *`,
        );
        if (!updated[0]) throw new Error(RETURN_ALREADY_PROCESSED);
        await exec.query('COMMIT');
        return mapReturn(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async receive(
      id: string,
      receivedBy: string,
      lines: SalesReturnReceiveLineInput[],
      note: string | null,
    ): Promise<ReturnOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM return_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapReturn(locked[0]);
        if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT);
        if (order.status !== 'APPROVED') throw new Error(RETURN_ALREADY_PROCESSED);
        const salesOrder =
          order.salesOrderId != null ? await sales.findById(order.salesOrderId) : null;
        if (!salesOrder) throw new Error('SALES_NOT_FOUND: sales order does not exist');

        const itemRows = await exec.query(
          `SELECT * FROM return_order_items WHERE return_order_id = ${quote(id)} ORDER BY id ASC`,
        );
        const returnItems = itemRows.rows.map(mapReturnItem);
        const byId = new Map(returnItems.map((i) => [i.id, i]));

        // 校验：每行实收数量 0 ≤ receivedQty ≤ 申请数量；所有退货行必须录入。
        const receivedByItem = new Map<string, number>();
        for (const line of lines) {
          const item = byId.get(line.returnItemId);
          if (!item) throw new Error(RETURN_LINE_INVALID);
          const rqty = Number(line.receivedQty);
          if (!Number.isFinite(rqty) || rqty < 0) throw new Error(RETURN_LINE_INVALID);
          if (rqty > Number(item.qty) + 1e-9) throw new Error(RETURN_QTY_EXCEEDED);
          receivedByItem.set(item.id, round2num((receivedByItem.get(item.id) ?? 0) + rqty));
        }
        if (receivedByItem.size !== returnItems.length) throw new Error(RETURN_LINE_INVALID);
        for (const [itemId, total] of receivedByItem) {
          const item = byId.get(itemId)!;
          if (total > Number(item.qty) + 1e-9) throw new Error(RETURN_QTY_EXCEEDED);
        }

        // 原批次 unit_cost 快照（取该销售单 OUTBOUND_SALE 流水，按批次）。
        const unitCostByBatch = new Map<string, string>();
        const { rows: costRows } = await exec.query(
          `SELECT batch_id, unit_cost FROM stock_movements
           WHERE order_type = 'sales' AND order_id = ${quote(salesOrder.id)}
             AND type = 'OUTBOUND_SALE'
           ORDER BY created_at DESC`,
        );
        for (const row of costRows) {
          const batchId = String(row.batch_id);
          if (!unitCostByBatch.has(batchId) && row.unit_cost != null) {
            unitCostByBatch.set(batchId, String(row.unit_cost));
          }
        }

        // 按销售行分配记录确定原批次（按分配顺序依次回补，量不足则转待检批次）。
        const { rows: allocRows } = await exec.query(
          `SELECT a.order_item_id, a.batch_id, a.qty
           FROM sales_batch_allocations a
           JOIN sales_order_items oi ON oi.id = a.order_item_id
           WHERE oi.sales_order_id = ${quote(salesOrder.id)}
           GROUP BY a.order_item_id, a.batch_id, a.qty, a.created_at, a.id
           ORDER BY a.order_item_id ASC, a.created_at ASC, a.id ASC`,
        );
        const allocByItem = new Map<string, { batchId: string; qty: number }[]>();
        for (const row of allocRows) {
          const key = String(row.order_item_id);
          const list = allocByItem.get(key) ?? [];
          list.push({ batchId: String(row.batch_id), qty: Number(String(row.qty)) });
          allocByItem.set(key, list);
        }

        const replenish = async (itemId: string, batchId: string, rqty: number, unitCost: string) => {
          const { rows: upserted } = await exec.query(
            `INSERT INTO stock (unit_id, item_id, batch_id, qty, avg_cost, version, updated_at)
             VALUES (${quote(salesOrder.sellerUnitId)}, ${quote(itemId)},
                     ${quote(batchId)}, ${quote(rqty.toFixed(2))}, ${quote(unitCost)}, 1, now())
             ON CONFLICT (unit_id, item_id, batch_id)
             DO UPDATE SET qty = stock.qty + ${quote(rqty.toFixed(2))},
                           avg_cost = stock.avg_cost,
                           version = stock.version + 1, updated_at = now()
             RETURNING qty`,
          );
          const qtyAfter = Number(String(upserted[0]?.qty ?? '0'));
          const qtyBefore = round2num(qtyAfter - rqty);
          await exec.query(
            `INSERT INTO stock_movements
               (unit_id, item_id, batch_id, type, qty_delta, qty_before, qty_after, unit_cost,
                order_type, order_id, ref_no, operator_id)
             VALUES (${quote(salesOrder.sellerUnitId)}, ${quote(itemId)},
                     ${quote(batchId)}, 'RETURN_IN',
                     ${quote(rqty.toFixed(2))}, ${quote(qtyBefore.toFixed(2))},
                     ${quote(qtyAfter.toFixed(2))}, ${quote(unitCost)}, 'sales',
                     ${quote(salesOrder.id)}, ${quote(order.returnNo)}, ${quote(receivedBy)})`,
          );
        };

        const findPendingBatch = async (itemId: string): Promise<string | null> => {
          const { rows } = await exec.query(
            `SELECT id FROM batches
             WHERE item_id = ${quote(itemId)} AND source_type = 'RETURNS_PENDING'
               AND production_date IS NULL AND expiry_date IS NULL
             ORDER BY created_at ASC, id ASC LIMIT 1`,
          );
          return rows[0] ? String(rows[0].id) : null;
        };
        const ensurePendingBatch = async (itemId: string): Promise<string> => {
          const existing = await findPendingBatch(itemId);
          if (existing) return existing;
          const { rows } = await exec.query(
            `INSERT INTO batches
               (item_id, batch_no, production_date, expiry_date, source_type,
                source_order_id, created_by)
             VALUES (${quote(itemId)}, ${quote(ensureBatchNo(itemId, null))}, NULL, NULL, 'RETURNS_PENDING',
                     ${quote(order.id)}, ${quote(receivedBy)})
             RETURNING id`,
          );
          return String(rows[0].id);
        };

        for (const item of returnItems) {
          const rqty = receivedByItem.get(item.id) ?? 0;
          if (rqty <= 0) continue;
          let remaining = rqty;
          const allocs = item.salesOrderItemId ? (allocByItem.get(item.salesOrderItemId) ?? []) : [];
          const targets: { batchId: string; qty: number; unitCost: string }[] = [];
          for (const alloc of allocs) {
            if (remaining <= 0) break;
            const take = Math.min(alloc.qty, remaining);
            targets.push({
              batchId: alloc.batchId,
              qty: take,
              unitCost: unitCostByBatch.get(alloc.batchId) ?? '0',
            });
            remaining = round2num(remaining - take);
          }
          if (remaining > 0) {
            // 无原批次/无法确定 → 回补到「退货待检批次」（待质检）。
            const pendingBatchId = await ensurePendingBatch(item.itemId);
            targets.push({ batchId: pendingBatchId, qty: remaining, unitCost: '0' });
          }
          for (const target of targets) {
            await replenish(item.itemId, target.batchId, target.qty, target.unitCost);
          }
          await exec.query(
            `UPDATE return_order_items
             SET received_qty = ${quote(rqty.toFixed(2))},
                 original_batch_id = ${quote(targets[0]?.batchId ?? null)}
             WHERE id = ${quote(item.id)}`,
          );
        }

        const { rows: updated } = await exec.query(
          `UPDATE return_orders
           SET status = 'RETURNED', processed_by = ${quote(receivedBy)},
               processed_at = now(), processed_note = ${quote(nn(note))}, updated_at = now()
           WHERE id = ${quote(id)} AND status = 'APPROVED' RETURNING *`,
        );
        if (!updated[0]) throw new Error(RETURN_ALREADY_PROCESSED);
        await exec.query('COMMIT');
        return mapReturn(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };

  return returns;
}
