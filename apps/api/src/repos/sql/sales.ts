// 销售单仓库（sales_orders + 明细 + 批次分配 + 支付）。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateSalesRepoInput, PatchSalesInput, PaymentRecord, SalesAllocationInput, SalesBatchAllocationRecord, SalesListQuery, SalesListResult, SalesOrderItemRecord, SalesOrderRecord, SalesRepository } from '../../types';
import { ITEM_SPEC_SQL } from '../item-spec';
import { INSUFFICIENT_STOCK, SALES_LINE_INVALID, SALES_STATE_CONFLICT, STOCK_BATCH_NOT_FOUND } from './errors';
import { inClause, nn, quote, round2num } from './helpers';
import { mapPayment, mapSalesAllocation, mapSalesItem, mapSalesOrder } from './mappers';
import { calcTotal, computeSalesLines, errorWithLineDetails } from './sales-lines';
import { nextSalesNo } from './sequences';

  async function readSalesOrder(
    exec: SqlExecutor,id: string): Promise<SalesOrderRecord | null> {
    const { rows } = await exec.query(
      `SELECT so.*,
              EXISTS (SELECT 1 FROM payments p WHERE p.sales_order_id = so.id) AS has_payment
       FROM sales_orders so WHERE so.id = ${quote(id)} LIMIT 1`,
    );
    return rows[0] ? mapSalesOrder(rows[0]) : null;
  }

export function createSalesRepo(exec: SqlExecutor): SalesRepository {
  const sales: SalesRepository = {
    async list(query: SalesListQuery): Promise<SalesListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.status) parts.push(`${alias}status = ${quote(query.status)}`);
        if (query.unitId) {
          parts.push(`(${alias}seller_unit_id = ${quote(query.unitId)} OR ${alias}buyer_unit_id = ${quote(query.unitId)})`);
        }
        if (query.buyerUnitId) {
          parts.push(`${alias}buyer_unit_id = ${quote(query.buyerUnitId)}`);
        }
        if (query.sellerUnitIds) {
          parts.push(inClause(`${alias}seller_unit_id`, query.sellerUnitIds));
        }
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM sales_orders${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT so.*,
                EXISTS (SELECT 1 FROM payments p WHERE p.sales_order_id = so.id) AS has_payment
         FROM sales_orders so
         ${where('so.')} ORDER BY so.created_at DESC, so.id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapSalesOrder), total, page, size };
    },
    async findById(id: string): Promise<SalesOrderRecord | null> {
      return readSalesOrder(exec, id);
    },
    async listItems(salesOrderId: string): Promise<SalesOrderItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT oi.*, i.name AS item_name,
                ${ITEM_SPEC_SQL} AS spec,
                i.min_sale_unit AS min_sale_unit
         FROM sales_order_items oi
         LEFT JOIN items i ON i.id = oi.item_id
         WHERE oi.sales_order_id = ${quote(salesOrderId)}
         ORDER BY oi.created_at ASC, oi.id ASC`,
      );
      return rows.map(mapSalesItem);
    },
    async listAllocations(salesOrderId: string): Promise<SalesBatchAllocationRecord[]> {
      const { rows } = await exec.query(
        `SELECT a.*, oi.item_id, i.name AS item_name, b.batch_no, b.expiry_date
         FROM sales_batch_allocations a
         JOIN sales_order_items oi ON oi.id = a.order_item_id
         LEFT JOIN items i ON i.id = oi.item_id
         LEFT JOIN batches b ON b.id = a.batch_id
         WHERE oi.sales_order_id = ${quote(salesOrderId)}
         ORDER BY oi.created_at ASC, oi.id ASC, a.created_at ASC, a.id ASC`,
      );
      return rows.map(mapSalesAllocation);
    },
    async findPayment(salesOrderId: string): Promise<PaymentRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM payments WHERE sales_order_id = ${quote(salesOrderId)} LIMIT 1`,
      );
      return rows[0] ? mapPayment(rows[0]) : null;
    },
    async create(input: CreateSalesRepoInput): Promise<SalesOrderRecord> {
      const salesNo = await nextSalesNo(exec);
      await exec.query('BEGIN');
      try {
        const lines = await computeSalesLines(exec, input.sellerUnitId, input.currency, input.items, (l) => l.qty);
        const { rows } = await exec.query(
          `INSERT INTO sales_orders
             (sales_no, seller_unit_id, buyer_unit_id, source, delivery_method,
              delivery_address, carrier, tracking_no, freight, discount_percent,
              currency, total_amount, status, remark, created_by)
           VALUES (${quote(salesNo)}, ${quote(input.sellerUnitId)}, ${quote(input.buyerUnitId)},
                   ${quote(input.source)}, ${quote(input.deliveryMethod)},
                   ${quote(input.deliveryAddress)}, ${quote(nn(input.carrier))},
                   ${quote(nn(input.trackingNo))}, ${quote(input.freight)},
                   ${quote(input.discountPercent)}, ${quote(input.currency)},
                   ${quote(calcTotal(lines, input.discountPercent, input.freight))},
                   'DRAFT', ${quote(input.remark)}, ${quote(input.createdBy)})
           RETURNING *`,
        );
        const order = mapSalesOrder(rows[0]);
        for (const line of lines) {
          await exec.query(
            `INSERT INTO sales_order_items
               (sales_order_id, item_id, qty, list_price, list_price_currency, price, line_total)
             VALUES (${quote(order.id)}, ${quote(line.itemId)}, ${quote(line.qty)},
                     ${quote(line.listPrice)}, ${quote(line.listPriceCurrency)},
                     ${quote(line.price)}, ${quote(line.lineTotal)})`,
          );
        }
        await exec.query('COMMIT');
        return (await readSalesOrder(exec, order.id)) ?? order;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async update(id: string, input: PatchSalesInput): Promise<SalesOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM sales_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        if (mapSalesOrder(locked[0]).status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT);
        const order = mapSalesOrder(locked[0]);

        if (input.items) {
          const lines = await computeSalesLines(
            exec,
            order.sellerUnitId,
            input.currency ?? order.currency,
            input.items,
            (l) => l.qty,
          );
          await exec.query(
            `DELETE FROM sales_order_items WHERE sales_order_id = ${quote(id)}`,
          );
          for (const line of lines) {
            await exec.query(
              `INSERT INTO sales_order_items
                 (sales_order_id, item_id, qty, list_price, list_price_currency, price, line_total)
               VALUES (${quote(id)}, ${quote(line.itemId)}, ${quote(line.qty)},
                       ${quote(line.listPrice)}, ${quote(line.listPriceCurrency)},
                       ${quote(line.price)}, ${quote(line.lineTotal)})`,
            );
          }
        }
        const { rows: itemRows } = await exec.query(
          `SELECT line_total FROM sales_order_items WHERE sales_order_id = ${quote(id)}`,
        );
        const freight = input.freight ?? order.freight;
        const discountPercent = input.discountPercent ?? order.discountPercent;
        const totalAmount = calcTotal(
          itemRows.map((r) => ({ lineTotal: r.line_total != null ? String(r.line_total) : '0' })),
          discountPercent,
          freight,
        );
        const { rows } = await exec.query(
          `UPDATE sales_orders SET
             delivery_method = COALESCE(${quote(input.deliveryMethod ?? null)}, delivery_method),
             delivery_address = COALESCE(${quote(input.deliveryAddress ?? null)}, delivery_address),
             carrier = COALESCE(${quote(nn(input.carrier))}, carrier),
             tracking_no = COALESCE(${quote(nn(input.trackingNo))}, tracking_no),
             freight = ${quote(freight)},
             discount_percent = ${quote(discountPercent)},
             currency = COALESCE(${quote(input.currency ?? null)}, currency),
             remark = COALESCE(${quote(input.remark ?? null)}, remark),
             total_amount = ${quote(totalAmount)},
             updated_at = now()
           WHERE id = ${quote(id)} RETURNING *`,
        );
        await exec.query('COMMIT');
        return mapSalesOrder(rows[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async send(
      id: string,
      allocations: SalesAllocationInput[],
      sentBy: string,
      options: { carrier?: string | null; trackingNo?: string | null } = {},
    ): Promise<SalesOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM sales_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapSalesOrder(locked[0]);
        if (order.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT);

        const { rows: itemRows } = await exec.query(
          `SELECT oi.id AS order_item_id, oi.item_id, oi.qty, oi.list_price, oi.price,
                  i.name AS item_name
           FROM sales_order_items oi
           LEFT JOIN items i ON i.id = oi.item_id
           WHERE oi.sales_order_id = ${quote(id)}
           ORDER BY oi.created_at ASC, oi.id ASC`,
        );
        const lines: {
          index: number;
          orderItemId: string;
          itemId: string;
          qty: number;
          listPrice: string | null;
          price: string | null;
          itemName: string | null;
        }[] = [];
        const lineByItem = new Map<string, { orderItemId: string; qty: number }>();
        itemRows.forEach((row, index) => {
          const itemId = String(row.item_id);
          const orderItemId = String(row.order_item_id);
          const qty = Number(String(row.qty));
          lines.push({
            index: index + 1,
            orderItemId,
            itemId,
            qty,
            listPrice: row.list_price != null ? String(row.list_price) : null,
            price: row.price != null ? String(row.price) : null,
            itemName: row.item_name ? String(row.item_name) : null,
          });
          lineByItem.set(itemId, { orderItemId, qty });
        });

        // 发送时逐行校验价格：无零售价且无行级改价 → 400（带行级明细）。
        const noPriceLines = lines.filter((l) => l.price === null || l.price === '');
        if (noPriceLines.length > 0) {
          throw errorWithLineDetails(
            SALES_LINE_INVALID,
            noPriceLines.map((l) => ({
              index: l.index,
              itemId: l.itemId,
              itemName: l.itemName,
              reason: 'NO_LIST_PRICE' as const,
              message: `第${l.index}行（${l.itemName ?? '未知物品'}）：未设置零售价且未填写行级改价，无法发送`,
            })),
          );
        }

        const lineInfoOf = (itemId: string) => lines.find((l) => l.itemId === itemId) ?? null;
        const manualByItem = new Map<string, { batchId: string; qty: number }[]>();
        for (const allocLine of allocations) {
          if (!lineByItem.has(allocLine.itemId)) {
            throw errorWithLineDetails(SALES_LINE_INVALID, [
              {
                index: 0,
                itemId: allocLine.itemId,
                itemName: null,
                reason: 'NO_BATCH_STOCK',
                message: `手工分配引用了订单中不存在的物品（${allocLine.itemId}）`,
              },
            ]);
          }
          const list = manualByItem.get(allocLine.itemId) ?? [];
          list.push({ batchId: allocLine.batchId, qty: Number(allocLine.qty) });
          manualByItem.set(allocLine.itemId, list);
        }
        for (const [itemId, list] of manualByItem) {
          const line = lineByItem.get(itemId)!;
          const total = list.reduce((sum, a) => sum + a.qty, 0);
          if (Math.abs(total - line.qty) > 0.001) {
            const info = lineInfoOf(itemId);
            throw errorWithLineDetails(SALES_LINE_INVALID, [
              {
                index: info?.index ?? 0,
                itemId,
                itemName: info?.itemName ?? null,
                reason: 'QTY_EXCEEDS_STOCK',
                message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：手工分配数量与行数量不一致`,
              },
            ]);
          }
        }

        interface AllocPlan {
          orderItemId: string;
          itemId: string;
          batchId: string;
          qty: number;
          unitCost: string;
        }
        const plan: AllocPlan[] = [];
        for (const [itemId, line] of lineByItem) {
          const info = lineInfoOf(itemId);
          const manual = manualByItem.get(itemId);
          let remaining = line.qty;
          const take = (rows: { batch_id: unknown; qty: unknown; avg_cost: unknown }[]) => {
            for (const row of rows) {
              if (remaining <= 0) break;
              const avail = Number(String(row.qty ?? '0'));
              const t = Math.min(avail, remaining);
              plan.push({
                orderItemId: line.orderItemId,
                itemId,
                batchId: String(row.batch_id),
                qty: t,
                unitCost: String(row.avg_cost ?? '0'),
              });
              remaining = round2num(remaining - t);
            }
          };
          if (manual) {
            for (const allocLine of manual) {
              const { rows: stockRows } = await exec.query(
                `SELECT qty, avg_cost FROM stock
                  WHERE unit_id = ${quote(order.sellerUnitId)}
                    AND item_id = ${quote(itemId)}
                    AND batch_id = ${quote(allocLine.batchId)}
                  FOR UPDATE`,
              );
              if (!stockRows[0]) {
                throw errorWithLineDetails(STOCK_BATCH_NOT_FOUND, [
                  {
                    index: info?.index ?? 0,
                    itemId,
                    itemName: info?.itemName ?? null,
                    reason: 'NO_BATCH_STOCK',
                    message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：指定批次在当前仓库无库存`,
                  },
                ]);
              }
              const avail = Number(String(stockRows[0].qty ?? '0'));
              if (avail < allocLine.qty) {
                throw errorWithLineDetails(INSUFFICIENT_STOCK, [
                  {
                    index: info?.index ?? 0,
                    itemId,
                    itemName: info?.itemName ?? null,
                    reason: 'QTY_EXCEEDS_STOCK',
                    message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：库存不足，无法发送`,
                  },
                ]);
              }
              plan.push({
                orderItemId: line.orderItemId,
                itemId,
                batchId: allocLine.batchId,
                qty: allocLine.qty,
                unitCost: String(stockRows[0].avg_cost ?? '0'),
              });
              remaining = round2num(remaining - allocLine.qty);
            }
          } else {
            const { rows: fefoRows } = await exec.query(
              `SELECT s.batch_id, s.qty, s.avg_cost
               FROM stock s
               JOIN batches b ON b.id = s.batch_id
               WHERE s.unit_id = ${quote(order.sellerUnitId)}
                 AND s.item_id = ${quote(itemId)}
                 AND s.qty > 0
               ORDER BY b.expiry_date ASC NULLS LAST,
                        b.production_date ASC NULLS LAST, s.batch_id ASC
               FOR UPDATE`,
            );
            const availTotal = fefoRows.reduce((sum, r) => sum + Number(String(r.qty ?? '0')), 0);
            if (availTotal < line.qty) {
              throw errorWithLineDetails(INSUFFICIENT_STOCK, [
                {
                  index: info?.index ?? 0,
                  itemId,
                  itemName: info?.itemName ?? null,
                  reason: 'QTY_EXCEEDS_STOCK',
                  message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：库存不足，无法发送`,
                },
              ]);
            }
            take(fefoRows as { batch_id: unknown; qty: unknown; avg_cost: unknown }[]);
          }
        }

        for (const alloc of plan) {
          const { rows: updated } = await exec.query(
            `UPDATE stock
             SET qty = qty - ${quote(alloc.qty.toFixed(2))}, version = version + 1, updated_at = now()
             WHERE unit_id = ${quote(order.sellerUnitId)}
               AND item_id = ${quote(alloc.itemId)}
               AND batch_id = ${quote(alloc.batchId)}
               AND qty >= ${quote(alloc.qty.toFixed(2))}
             RETURNING qty`,
          );
          if (!updated[0]) throw new Error(INSUFFICIENT_STOCK);
          const qtyAfter = Number(String(updated[0].qty));
          const qtyBefore = round2num(qtyAfter + alloc.qty);
          await exec.query(
            `INSERT INTO stock_movements
               (unit_id, item_id, batch_id, type, qty_delta, qty_before, qty_after, unit_cost,
                order_type, order_id, ref_no, operator_id)
             VALUES (${quote(order.sellerUnitId)}, ${quote(alloc.itemId)},
                     ${quote(alloc.batchId)}, 'OUTBOUND_SALE',
                     ${quote(`-${alloc.qty.toFixed(2)}`)}, ${quote(qtyBefore.toFixed(2))},
                     ${quote(qtyAfter.toFixed(2))}, ${quote(alloc.unitCost)}, 'sales',
                     ${quote(order.id)}, ${quote(order.salesNo)}, ${quote(sentBy)})`,
          );
          await exec.query(
            `INSERT INTO sales_batch_allocations (order_item_id, batch_id, qty)
             VALUES (${quote(alloc.orderItemId)}, ${quote(alloc.batchId)}, ${quote(alloc.qty.toFixed(2))})`,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE sales_orders
           SET status = 'SENT', sent_at = now(), updated_at = now(),
               carrier = COALESCE(${quote(options.carrier ?? null)}, carrier),
               tracking_no = COALESCE(${quote(options.trackingNo ?? null)}, tracking_no)
           WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING *`,
        );
        if (!updated[0]) throw new Error(SALES_STATE_CONFLICT);
        await exec.query('COMMIT');
        return (await readSalesOrder(exec, order.id)) ?? mapSalesOrder(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async cancel(id: string, cancelledBy: string): Promise<SalesOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM sales_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapSalesOrder(locked[0]);
        if (order.status === 'CONFIRMED') throw new Error(SALES_STATE_CONFLICT);
        if (order.status === 'CANCELLED') throw new Error(SALES_STATE_CONFLICT);

        if (order.status !== 'DRAFT') {
          const { rows: allocRows } = await exec.query(
            `SELECT a.*, oi.item_id FROM sales_batch_allocations a
             JOIN sales_order_items oi ON oi.id = a.order_item_id
             WHERE oi.sales_order_id = ${quote(id)}
             ORDER BY a.created_at ASC, a.id ASC`,
          );
          for (const row of allocRows) {
            const allocQty = Number(String(row.qty));
            const { rows: moveRows } = await exec.query(
              `SELECT unit_cost FROM stock_movements
               WHERE order_type = 'sales' AND order_id = ${quote(id)}
                 AND batch_id = ${quote(String(row.batch_id))} AND type = 'OUTBOUND_SALE'
               ORDER BY created_at DESC LIMIT 1`,
            );
            const unitCost = moveRows[0]?.unit_cost != null ? String(moveRows[0].unit_cost) : '0';
            const { rows: upserted } = await exec.query(
              `INSERT INTO stock (unit_id, item_id, batch_id, qty, avg_cost, version, updated_at)
               VALUES (${quote(order.sellerUnitId)}, ${quote(String(row.item_id))},
                       ${quote(String(row.batch_id))}, ${quote(allocQty.toFixed(2))},
                       ${quote(unitCost)}, 1, now())
               ON CONFLICT (unit_id, item_id, batch_id)
               DO UPDATE SET qty = stock.qty + ${quote(allocQty.toFixed(2))},
                             avg_cost = stock.avg_cost,
                             version = stock.version + 1, updated_at = now()
               RETURNING qty`,
            );
            const qtyAfter = Number(String(upserted[0].qty));
            const qtyBefore = round2num(qtyAfter - allocQty);
            await exec.query(
              `INSERT INTO stock_movements
                 (unit_id, item_id, batch_id, type, qty_delta, qty_before, qty_after, unit_cost,
                  order_type, order_id, ref_no, operator_id)
               VALUES (${quote(order.sellerUnitId)}, ${quote(String(row.item_id))},
                       ${quote(String(row.batch_id))}, 'OUTBOUND_SALE_REVERSAL',
                       ${quote(allocQty.toFixed(2))}, ${quote(qtyBefore.toFixed(2))},
                       ${quote(qtyAfter.toFixed(2))}, ${quote(unitCost)}, 'sales',
                       ${quote(order.id)}, ${quote(order.salesNo)}, ${quote(cancelledBy)})`,
            );
          }
          await exec.query(
            `UPDATE payments SET refund_note = ${quote('销售单已取消，退款线下处理')}
             WHERE sales_order_id = ${quote(id)}`,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE sales_orders
           SET status = 'CANCELLED', updated_at = now()
           WHERE id = ${quote(id)} AND status <> 'CONFIRMED' AND status <> 'CANCELLED'
           RETURNING *`,
        );
        if (!updated[0]) throw new Error(SALES_STATE_CONFLICT);
        await exec.query('COMMIT');
        return (await readSalesOrder(exec, order.id)) ?? mapSalesOrder(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async uploadPayment(
      id: string,
      input: { amount: string; currency: string; methodNote: string | null; proofFileId: string | null; uploadedBy: string },
    ): Promise<PaymentRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT status FROM sales_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const status = String(locked[0].status);
        if (status !== 'SENT' && status !== 'PAYMENT_UPLOADED') {
          throw new Error(SALES_STATE_CONFLICT);
        }
        const { rows } = await exec.query(
          `INSERT INTO payments (sales_order_id, amount, currency, method_note, proof_file_id, uploaded_by)
           VALUES (${quote(id)}, ${quote(input.amount)}, ${quote(input.currency)},
                   ${quote(input.methodNote)}, ${quote(input.proofFileId)}, ${quote(input.uploadedBy)})
           ON CONFLICT (sales_order_id)
           DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency,
                         method_note = EXCLUDED.method_note, proof_file_id = EXCLUDED.proof_file_id,
                         uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now()
           RETURNING *`,
        );
        await exec.query(
          `UPDATE sales_orders SET status = 'PAYMENT_UPLOADED', updated_at = now()
           WHERE id = ${quote(id)}`,
        );
        await exec.query('COMMIT');
        return mapPayment(rows[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async confirmReceipt(id: string, confirmedBy: string): Promise<SalesOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM sales_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapSalesOrder(locked[0]);
        if (order.status !== 'PAYMENT_UPLOADED') throw new Error(SALES_STATE_CONFLICT);
        const { rows: updated } = await exec.query(
          `UPDATE sales_orders
           SET status = 'CONFIRMED', confirmed_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PAYMENT_UPLOADED'
           RETURNING *`,
        );
        if (!updated[0]) throw new Error(SALES_STATE_CONFLICT);
        await exec.query('COMMIT');
        return (await readSalesOrder(exec, order.id)) ?? mapSalesOrder(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async delete(id: string): Promise<boolean> {
      const existing = await this.findById(id);
      if (!existing) return false;
      if (existing.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT);
      const { rows } = await exec.query(
        `DELETE FROM sales_orders WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING id`,
      );
      return rows.length > 0;
    },
  };

  return sales;
}
