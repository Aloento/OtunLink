// 出库单仓库（outbound_orders + outbound_order_items）。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateOutboundRepoInput, OutboundListQuery, OutboundListResult, OutboundOrderItemRecord, OutboundOrderRecord, OutboundRepository, UpdateOutboundRepoInput } from '../../types';
import { ITEM_SPEC_SQL } from '../item-spec';
import { INSUFFICIENT_STOCK, OUTBOUND_STATE_CONFLICT, STOCK_BATCH_NOT_FOUND } from './errors';
import { nn, photoArray, quote } from './helpers';
import { mapOutbound, mapOutboundItem } from './mappers';
import { nextOutboundNo } from './sequences';

export function createOutboundsRepo(exec: SqlExecutor): OutboundRepository {
  const outbounds: OutboundRepository = {
    async list(query: OutboundListQuery): Promise<OutboundListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.status) parts.push(`${alias}status = ${quote(query.status)}`);
        if (query.type) parts.push(`${alias}type = ${quote(query.type)}`);
        if (query.warehouseUnitId) {
          parts.push(`${alias}warehouse_unit_id = ${quote(query.warehouseUnitId)}`);
        }
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM outbound_orders${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT oo.*, bu.name AS warehouse_name, cp.name AS counterparty_name
         FROM outbound_orders oo
         LEFT JOIN business_units bu ON bu.id = oo.warehouse_unit_id
         LEFT JOIN business_units cp ON cp.id = oo.counterparty_unit_id
         ${where('oo.')} ORDER BY oo.created_at DESC, oo.id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapOutbound), total, page, size };
    },
    async findById(id: string): Promise<OutboundOrderRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM outbound_orders WHERE id = ${quote(id)} LIMIT 1`,
      );
      return rows[0] ? mapOutbound(rows[0]) : null;
    },
    async listItems(outboundOrderId: string): Promise<OutboundOrderItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT ooi.*, i.name AS item_name,
                ${ITEM_SPEC_SQL} AS spec, b.batch_no
         FROM outbound_order_items ooi
         LEFT JOIN items i ON i.id = ooi.item_id
         LEFT JOIN batches b ON b.id = ooi.batch_id
         WHERE ooi.outbound_order_id = ${quote(outboundOrderId)}
         ORDER BY ooi.created_at ASC, ooi.id ASC`,
      );
      return rows.map(mapOutboundItem);
    },
    async create(input: CreateOutboundRepoInput): Promise<OutboundOrderRecord> {
      const outboundNo = await nextOutboundNo(exec);
      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO outbound_orders
             (outbound_no, type, warehouse_unit_id, counterparty_unit_id, status,
              loss_reason, remark, photo_file_ids, created_by)
           VALUES (${quote(outboundNo)}, ${quote(input.type)}, ${quote(input.warehouseUnitId)},
                  ${quote(input.counterpartyUnitId)}, 'DRAFT', ${quote(nn(input.lossReason))},
                  ${quote(nn(input.remark))},
                  ${photoArray(input.photoFileIds)}, ${quote(input.createdBy)})
           RETURNING *`,
        );
        const outbound = mapOutbound(rows[0]);
        for (const line of input.lines) {
          await exec.query(
            `INSERT INTO outbound_order_items
               (outbound_order_id, item_id, batch_id, qty)
             VALUES (${quote(outbound.id)}, ${quote(line.itemId)}, ${quote(line.batchId)},
                    ${quote(line.qty)})`,
          );
        }
        await exec.query('COMMIT');
        return outbound;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async update(
      id: string,
      input: UpdateOutboundRepoInput,
    ): Promise<OutboundOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM outbound_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const existing = mapOutbound(locked[0]);
        if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT);
        const { rows: updated } = await exec.query(
          `UPDATE outbound_orders
           SET type = ${quote(input.type)},
               warehouse_unit_id = ${quote(input.warehouseUnitId)},
               counterparty_unit_id = ${quote(input.counterpartyUnitId)},
               loss_reason = ${quote(nn(input.lossReason))},
               remark = ${quote(nn(input.remark))},
               photo_file_ids = ${photoArray(input.photoFileIds)},
               updated_at = now()
           WHERE id = ${quote(id)} AND status = 'DRAFT'
           RETURNING *`,
        );
        if (!updated[0]) throw new Error(OUTBOUND_STATE_CONFLICT);
        await exec.query(
          `DELETE FROM outbound_order_items WHERE outbound_order_id = ${quote(id)}`,
        );
        for (const line of input.lines) {
          await exec.query(
            `INSERT INTO outbound_order_items
               (outbound_order_id, item_id, batch_id, qty)
             VALUES (${quote(id)}, ${quote(line.itemId)}, ${quote(line.batchId)},
                    ${quote(line.qty)})`,
          );
        }
        await exec.query('COMMIT');
        return mapOutbound(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async post(id: string, postedBy: string): Promise<OutboundOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM outbound_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const outbound = mapOutbound(locked[0]);
        if (outbound.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT);

        const { rows: itemRows } = await exec.query(
          `SELECT ooi.*,
                  ${ITEM_SPEC_SQL} AS spec
            FROM outbound_order_items ooi
           LEFT JOIN items i ON i.id = ooi.item_id
           WHERE ooi.outbound_order_id = ${quote(id)}
           ORDER BY ooi.created_at ASC, ooi.id ASC`,
        );
        const items = itemRows.map(mapOutboundItem);
        // 报损（type=LOSS）→ OUTBOUND_LOSS 流水；手工出库 → OUTBOUND_NORMAL。
        const movementType = outbound.type === 'LOSS' ? 'OUTBOUND_LOSS' : 'OUTBOUND_NORMAL';
        const allocations: { itemId: string; batchId: string; qty: number; unitCost: string }[] = [];
        for (const line of items) {
          const qty = Number(line.qty);
          if (line.batchId) {
            const { rows: stockRows } = await exec.query(
              `SELECT qty, avg_cost FROM stock
                WHERE unit_id = ${quote(outbound.warehouseUnitId)}
                  AND item_id = ${quote(line.itemId)}
                  AND batch_id = ${quote(line.batchId)}
                FOR UPDATE`,
            );
            if (!stockRows[0]) throw new Error(STOCK_BATCH_NOT_FOUND);
            const avail = Number(String(stockRows[0].qty ?? '0'));
            if (avail < qty) throw new Error(INSUFFICIENT_STOCK);
            allocations.push({
              itemId: line.itemId,
              batchId: line.batchId,
              qty,
              unitCost: String(stockRows[0].avg_cost ?? '0'),
            });
          } else {
            const { rows: fefoRows } = await exec.query(
              `SELECT s.batch_id, s.qty, s.avg_cost
               FROM stock s
               JOIN batches b ON b.id = s.batch_id
               WHERE s.unit_id = ${quote(outbound.warehouseUnitId)}
                 AND s.item_id = ${quote(line.itemId)}
                 AND s.qty > 0
               ORDER BY b.expiry_date ASC NULLS LAST,
                        b.production_date ASC NULLS LAST, s.batch_id ASC
               FOR UPDATE`,
            );
            const availTotal = fefoRows.reduce(
              (sum, r) => sum + Number(String(r.qty ?? '0')),
              0,
            );
            if (availTotal < qty) throw new Error(INSUFFICIENT_STOCK);
            let remaining = qty;
            for (const row of fefoRows) {
              if (remaining <= 0) break;
              const take = Math.min(Number(String(row.qty ?? '0')), remaining);
              allocations.push({
                itemId: line.itemId,
                batchId: String(row.batch_id),
                qty: take,
                unitCost: String(row.avg_cost ?? '0'),
              });
              remaining -= take;
            }
          }
        }

        await exec.query(
          `DELETE FROM outbound_order_items WHERE outbound_order_id = ${quote(id)}`,
        );
        for (const alloc of allocations) {
          const { rows: updated } = await exec.query(
            `UPDATE stock
             SET qty = qty - ${quote(alloc.qty.toFixed(2))}, version = version + 1, updated_at = now()
             WHERE unit_id = ${quote(outbound.warehouseUnitId)}
               AND item_id = ${quote(alloc.itemId)}
               AND batch_id = ${quote(alloc.batchId)}
               AND qty >= ${quote(alloc.qty.toFixed(2))}
             RETURNING qty`,
          );
          if (!updated[0]) throw new Error(INSUFFICIENT_STOCK);
          const qtyAfter = Number(String(updated[0].qty));
          const qtyBefore = qtyAfter + alloc.qty;
          await exec.query(
            `INSERT INTO stock_movements
               (unit_id, item_id, batch_id, type, qty_delta, qty_before, qty_after, unit_cost,
                order_type, order_id, ref_no, operator_id)
             VALUES (${quote(outbound.warehouseUnitId)}, ${quote(alloc.itemId)},
                    ${quote(alloc.batchId)}, ${quote(movementType)},
                    ${quote(`-${alloc.qty.toFixed(2)}`)}, ${quote(qtyBefore.toFixed(2))},
                    ${quote(qtyAfter.toFixed(2))}, ${quote(alloc.unitCost)}, 'outbound',
                    ${quote(outbound.id)}, ${quote(outbound.outboundNo)}, ${quote(postedBy)})`,
          );
          await exec.query(
            `INSERT INTO outbound_order_items
               (outbound_order_id, item_id, batch_id, qty, unit_cost)
             VALUES (${quote(outbound.id)}, ${quote(alloc.itemId)}, ${quote(alloc.batchId)},
                    ${quote(alloc.qty.toFixed(2))}, ${quote(alloc.unitCost)})`,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE outbound_orders
           SET status = 'POSTED', posted_by = ${quote(postedBy)}, posted_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING *`,
        );
        if (!updated[0]) throw new Error(OUTBOUND_STATE_CONFLICT);
        await exec.query('COMMIT');
        return mapOutbound(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async delete(id: string): Promise<boolean> {
      const existing = await this.findById(id);
      if (!existing) return false;
      if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT);
      const { rows } = await exec.query(
        `DELETE FROM outbound_orders WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING id`,
      );
      return rows.length > 0;
    },
  };

  return outbounds;
}
