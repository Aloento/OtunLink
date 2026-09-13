// 入库单仓库（inbound_orders + inbound_order_items）。
import type { SqlExecutor } from '@otunlink/db';
import type { ConfirmReceiptRepoInput, CreateInboundManualRepoInput, InboundListQuery, InboundListResult, InboundOrderItemRecord, InboundOrderRecord, InboundRepository, ShipmentRepository } from '../../types';
import { mergeInboundLines, qtyEqual } from '../inbound-lines';
import { INBOUND_STATE_CONFLICT, SHIPMENT_NOT_READY } from './errors';
import { nn, photoArray, quote } from './helpers';
import { insertDraftInbound, perishableDates, postInboundLine } from './inbound-posting';
import { mapInbound, mapInboundItem } from './mappers';
import { nextInboundNo } from './sequences';

export function createInboundsRepo(
  exec: SqlExecutor,
  deps: { shipments: Pick<ShipmentRepository, 'findById' | 'listItems'> },
): InboundRepository {
  const { shipments } = deps;
  const inbounds: InboundRepository = {
    async list(query: InboundListQuery): Promise<InboundListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.status) parts.push(`${alias}status = ${quote(query.status)}`);
        if (query.warehouseUnitId) parts.push(`${alias}warehouse_unit_id = ${quote(query.warehouseUnitId)}`);
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM inbound_orders${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT io.*, bu.name AS warehouse_name, cp.name AS counterparty_name, s.shipment_no
         FROM inbound_orders io
         LEFT JOIN business_units bu ON bu.id = io.warehouse_unit_id
         LEFT JOIN business_units cp ON cp.id = io.counterparty_unit_id
         LEFT JOIN shipments s ON s.id = io.shipment_id
         ${where('io.')} ORDER BY io.created_at DESC, io.id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapInbound), total, page, size };
    },
    async findById(id: string): Promise<InboundOrderRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM inbound_orders WHERE id = ${quote(id)} LIMIT 1`,
      );
      return rows[0] ? mapInbound(rows[0]) : null;
    },
    async listItems(inboundOrderId: string): Promise<InboundOrderItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT ioi.*, i.name AS item_name,
                CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END AS spec
         FROM inbound_order_items ioi
         LEFT JOIN items i ON i.id = ioi.item_id
         WHERE ioi.inbound_order_id = ${quote(inboundOrderId)}
         ORDER BY ioi.created_at ASC, ioi.id ASC`,
      );
      return rows.map(mapInboundItem);
    },
    async createManual(input: CreateInboundManualRepoInput): Promise<InboundOrderRecord> {
      const inboundNo = await nextInboundNo(exec);
      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO inbound_orders
             (inbound_no, source_type, shipment_id, warehouse_unit_id, counterparty_unit_id,
              status, remark, photo_file_ids, created_by)
           VALUES (${quote(inboundNo)}, 'MANUAL', NULL,
                  ${quote(input.warehouseUnitId)}, ${quote(input.counterpartyUnitId)},
                  'DRAFT', ${quote(nn(input.remark))}, ${photoArray(input.photoFileIds)},
                  ${quote(input.createdBy)})
           RETURNING *`,
        );
        const inbound = mapInbound(rows[0]);
        for (const line of input.lines) {
          const dates = await perishableDates(
            exec,
            line.itemId,
            nn(line.productionDate),
            nn(line.expiryDate),
          );
          await exec.query(
            `INSERT INTO inbound_order_items
               (inbound_order_id, item_id, qty, unit_cost, production_date, expiry_date, batch_no, line_note)
             VALUES (${quote(inbound.id)}, ${quote(line.itemId)}, ${quote(line.qty)},
                    ${quote(line.unitCost)}, ${quote(dates.productionDate)},
                    ${quote(dates.expiryDate)}, ${quote(nn(line.batchNo))},
                    ${quote(nn(line.lineNote ?? null))})`,
          );
        }
        await exec.query('COMMIT');
        return inbound;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async confirmReceipt(
      shipmentId: string,
      input: ConfirmReceiptRepoInput,
    ): Promise<InboundOrderRecord> {
      const shipment = await shipments.findById(shipmentId);
      if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
      if (shipment.status !== 'READY') throw new Error(SHIPMENT_NOT_READY);

      const shipmentItems = await shipments.listItems(shipmentId);
      if (shipmentItems.length === 0) throw new Error(SHIPMENT_NOT_READY);
      for (const item of shipmentItems) {
        if (!item.itemId) throw new Error(SHIPMENT_NOT_READY);
        if (item.actualQty === null || item.actualQty === '' || !qtyEqual(item.actualQty, item.expectedQty)) {
          throw new Error(SHIPMENT_NOT_READY);
        }
      }
      const validIds = new Set(shipmentItems.map((i) => i.id));
      for (const line of input.lines) {
        if (!validIds.has(line.shipmentItemId)) throw new Error(SHIPMENT_NOT_READY);
      }
      const batchNoByItem = new Map(input.lines.map((l) => [l.shipmentItemId, l.batchNo ?? null]));
      const merged = mergeInboundLines(
        shipmentItems,
        (item) => item.actualQty,
        (item) => batchNoByItem.get(item.id) ?? null,
        shipment.shipmentNo,
      );
      if (merged.length === 0) throw new Error(SHIPMENT_NOT_READY);

      const inboundNo = await nextInboundNo(exec);
      await exec.query('BEGIN');
      try {
        const inbound = await insertDraftInbound(exec, {
          inboundNo,
          shipmentId: shipment.id,
          warehouseUnitId: shipment.receiverUnitId,
          counterpartyUnitId: shipment.shipperUnitId,
          remark: input.remark,
          photoFileIds: input.photoFileIds,
          createdBy: input.createdBy,
          lines: merged,
        });
        await exec.query(
          `UPDATE shipments SET status = 'INBOUNDED', updated_at = now()
           WHERE id = ${quote(shipment.id)} AND status = 'READY'`,
        );
        await exec.query('COMMIT');
        return inbound;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async post(id: string, postedBy: string): Promise<InboundOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM inbound_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const inbound = mapInbound(locked[0]);
        if (inbound.status !== 'DRAFT') throw new Error(INBOUND_STATE_CONFLICT);

        const { rows: itemRows } = await exec.query(
          `SELECT * FROM inbound_order_items WHERE inbound_order_id = ${quote(id)}
           ORDER BY created_at ASC, id ASC`,
        );
        const items = itemRows.map(mapInboundItem);
        for (const line of items) {
          await postInboundLine(
            exec,
            inbound,
            line,
            postedBy,
            inbound.sourceType === 'MANUAL'
              ? { movementType: 'INBOUND_MANUAL', sourceOrderId: inbound.id }
              : undefined,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE inbound_orders
           SET status = 'POSTED', posted_by = ${quote(postedBy)}, posted_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING *`,
        );
        if (!updated[0]) throw new Error(INBOUND_STATE_CONFLICT);
        await exec.query('COMMIT');
        return mapInbound(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async delete(id: string): Promise<boolean> {
      const existing = await this.findById(id);
      if (!existing) return false;
      if (existing.status !== 'DRAFT') throw new Error(INBOUND_STATE_CONFLICT);
      const { rows } = await exec.query(
        `DELETE FROM inbound_orders WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING id`,
      );
      return rows.length > 0;
    },
  };

  return inbounds;
}
