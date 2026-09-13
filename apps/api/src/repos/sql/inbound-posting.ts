// 确认入库的事务内写入：草稿入库单与明细、批次/库存/台账写入。
import type { SqlExecutor } from '@otunlink/db';
import type { InboundOrderItemRecord, InboundOrderRecord } from '../../types';
import { ensureBatchNo } from '../../lib/batch';
import type { MergedInboundLine } from '../inbound-lines';
import { nn, photoArray, quote } from './helpers';
import { mapInbound } from './mappers';

/** 在事务内插入 DRAFT 入库单 + 明细；返回入库单记录（调用方负责 COMMIT/ROLLBACK）。 */
export async function insertDraftInbound(
  exec: SqlExecutor,
  params: {
  inboundNo: string;
  shipmentId: string | null;
  warehouseUnitId: string;
  counterpartyUnitId: string | null;
  remark: string | null;
  photoFileIds: string[];
  createdBy: string | null;
  lines: MergedInboundLine[];
}): Promise<InboundOrderRecord> {
  const { rows } = await exec.query(
    `INSERT INTO inbound_orders
       (inbound_no, source_type, shipment_id, warehouse_unit_id, counterparty_unit_id,
        status, remark, photo_file_ids, created_by)
     VALUES (${quote(params.inboundNo)}, 'SHIPMENT', ${quote(params.shipmentId)},
            ${quote(params.warehouseUnitId)}, ${quote(params.counterpartyUnitId)},
            'DRAFT', ${quote(nn(params.remark))}, ${photoArray(params.photoFileIds)},
            ${quote(params.createdBy)})
     RETURNING *`,
  );
  const inbound = mapInbound(rows[0]);
  for (const line of params.lines) {
    const dates = await perishableDates(
      exec,
      line.itemId,
      nn(line.productionDate),
      nn(line.expiryDate),
    );
    await exec.query(
      `INSERT INTO inbound_order_items
         (inbound_order_id, item_id, qty, unit_cost, production_date, expiry_date, batch_no)
       VALUES (${quote(inbound.id)}, ${quote(line.itemId)}, ${quote(line.qty)},
              ${quote(line.unitCost)}, ${quote(dates.productionDate)},
              ${quote(dates.expiryDate)}, ${quote(nn(line.batchNo))})`,
    );
  }
  return inbound;
}

/** 写入批次 → 库存（加权平均）→ 台账；调用方负责事务。 */
export async function postInboundLine(
  exec: SqlExecutor,
  inbound: InboundOrderRecord,
  line: InboundOrderItemRecord,
  operatorId: string | null,
  opts?: { movementType?: string; sourceOrderId?: string | null },
): Promise<string> {
  const movementType = opts?.movementType ?? 'INBOUND_SHIPMENT';
  const sourceOrderId = opts?.sourceOrderId ?? inbound.shipmentId;
  const batchNo = ensureBatchNo(line.itemId, line.batchNo);
  const dates = await perishableDates(exec, line.itemId, line.productionDate, line.expiryDate);
  const { rows: batchRows } = await exec.query(
    `INSERT INTO batches
       (item_id, batch_no, production_date, expiry_date, source_type, source_order_id, created_by)
     VALUES (${quote(line.itemId)}, ${quote(batchNo)}, ${quote(dates.productionDate)},
            ${quote(dates.expiryDate)}, ${quote(inbound.sourceType)},
            ${quote(sourceOrderId)}, ${quote(operatorId)})
     RETURNING id`,
  );
  const batchId = String(batchRows[0].id);
  await exec.query(
    `UPDATE inbound_order_items SET batch_id = ${quote(batchId)} WHERE id = ${quote(line.id)}`,
  );

  const inQty = Number(line.qty);
  const inCost = Number(line.unitCost);
  const { rows: stockRows } = await exec.query(
    `SELECT qty, avg_cost FROM stock
      WHERE unit_id = ${quote(inbound.warehouseUnitId)}
        AND item_id = ${quote(line.itemId)}
        AND batch_id = ${quote(batchId)}
      FOR UPDATE`,
  );
  const qtyBefore = stockRows[0] ? Number(String(stockRows[0].qty ?? '0')) : 0;
  const qtyAfter = qtyBefore + inQty;
  if (stockRows[0]) {
    const oldAvg = Number(String(stockRows[0].avg_cost ?? '0'));
    const newAvg = qtyAfter > 0 ? (qtyBefore * oldAvg + inQty * inCost) / qtyAfter : 0;
    await exec.query(
      `UPDATE stock SET qty = ${quote(qtyAfter.toFixed(2))}, avg_cost = ${quote(newAvg.toFixed(2))},
         version = version + 1, updated_at = now()
       WHERE unit_id = ${quote(inbound.warehouseUnitId)}
         AND item_id = ${quote(line.itemId)}
         AND batch_id = ${quote(batchId)}`,
    );
  } else {
    await exec.query(
      `INSERT INTO stock (unit_id, item_id, batch_id, qty, avg_cost, version)
       VALUES (${quote(inbound.warehouseUnitId)}, ${quote(line.itemId)}, ${quote(batchId)},
              ${quote(qtyAfter.toFixed(2))}, ${quote(line.unitCost)}, 1)`,
    );
  }
  await exec.query(
    `INSERT INTO stock_movements
       (unit_id, item_id, batch_id, type, qty_delta, qty_before, qty_after, unit_cost,
        order_type, order_id, ref_no, operator_id)
     VALUES (${quote(inbound.warehouseUnitId)}, ${quote(line.itemId)}, ${quote(batchId)},
            ${quote(movementType)}, ${quote(inQty.toFixed(2))}, ${quote(qtyBefore.toFixed(2))},
            ${quote(qtyAfter.toFixed(2))}, ${quote(line.unitCost)}, 'inbound',
            ${quote(inbound.id)}, ${quote(inbound.inboundNo)}, ${quote(operatorId)})`,
  );
  return batchId;
}

/** 非易腐物品（is_perishable=false）的生产/到期日应被清空；易腐物品原样保留。 */
export async function perishableDates(
  exec: SqlExecutor,
  itemId: string,
  productionDate: string | null,
  expiryDate: string | null,
): Promise<{ productionDate: string | null; expiryDate: string | null }> {
  const { rows } = await exec.query(
    `SELECT is_perishable FROM items WHERE id = ${quote(itemId)} LIMIT 1`,
  );
  const perishable = rows[0] ? Boolean(rows[0].is_perishable) : false;
  return perishable
    ? { productionDate, expiryDate }
    : { productionDate: null, expiryDate: null };
}
