// 发货单仓库（shipments + trackings + items + discrepancy reviews）。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateReviewInput, CreateShipmentInput, DiscrepancyReviewRecord, SaveCountResult, ShipmentCountRepoInput, ShipmentItemRecord, ShipmentListQuery, ShipmentListResult, ShipmentRecord, ShipmentRepository, ShipmentTrackingRecord, UpdateShipmentInput } from '../../types';
import { ITEM_SPEC_SQL } from '../item-spec';
import { COUNTING_STATE_CONFLICT, COUNT_LINE_INVALID, REVIEW_ALREADY_PROCESSED, REVIEW_NO_DIFFERENCE, SHIPMENT_STATE_CONFLICT, SHIPMENT_TRACKING_CONFLICT } from './errors';
import { col, nn, photoArray, quote } from './helpers';
import { mapDiscrepancyReview, mapDiscrepancyReviewItem, mapShipment, mapShipmentItem, mapShipmentTracking } from './mappers';

// 物流单号唯一索引冲突翻译：把 PG 约束错误归一为业务错误码。
function translateTrackingError(err: unknown, message: string): never {
  const text = err instanceof Error ? err.message : String(err);
  if (/duplicate|unique|23505/i.test(text)) throw new Error(SHIPMENT_TRACKING_CONFLICT);
  throw new Error(message);
}

export function createShipmentsRepo(exec: SqlExecutor): ShipmentRepository {
  const shipments: ShipmentRepository = {
    async findById(id: string): Promise<ShipmentRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM shipments WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapShipment(rows[0]) : null;
    },
    async list(query: ShipmentListQuery): Promise<ShipmentListResult> {
      const where: string[] = [];
      if (query.status) where.push(`status = ${quote(query.status)}`);
      if (query.scopeUnitId) {
        where.push(
          `(shipper_unit_id = ${quote(query.scopeUnitId)} OR receiver_unit_id = ${quote(query.scopeUnitId)})`,
        );
      }
      const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(`SELECT count(*)::int AS n FROM shipments${clause}`);
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT * FROM shipments${clause} ORDER BY created_at DESC, id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapShipment), total, page, size };
    },
    async create(input: CreateShipmentInput): Promise<ShipmentRecord> {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `SH-${date}-`;
      const countResult = await exec.query(
        `SELECT count(*)::int AS n FROM shipments WHERE shipment_no LIKE ${quote(`${prefix}%`)}`,
      );
      const base = Number(countResult.rows[0]?.n ?? 0) + 1;
      let shipmentNo = `${prefix}${String(base).padStart(4, '0')}`;
      // 唯一索引兜底：并发/重跑时顺延序号。
      for (let attempt = 0; attempt < 50; attempt++) {
        const exists = await exec.query(
          `SELECT count(*)::int AS n FROM shipments WHERE shipment_no = ${quote(shipmentNo)}`,
        );
        if (Number(exists.rows[0]?.n ?? 0) === 0) break;
        shipmentNo = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
      }

      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO shipments
             (shipment_no, shipper_unit_id, receiver_unit_id, status, boxes_count,
              currency, expected_arrival_date, remark, created_by)
           VALUES (${quote(shipmentNo)}, ${quote(input.shipperUnitId)}, ${quote(input.receiverUnitId)},
                   'DRAFT', ${quote(input.boxesCount)}, ${quote(input.currency ?? 'CNY')},
                   ${quote(nn(input.expectedArrivalDate))}, ${quote(nn(input.remark))},
                   ${quote(input.createdBy)})
           RETURNING *`,
        );
        const shipment = mapShipment(rows[0]);
        for (const t of input.trackings) {
          try {
            await exec.query(
              `INSERT INTO shipment_trackings (shipment_id, carrier, tracking_no, note)
               VALUES (${quote(shipment.id)}, ${quote(t.carrier)}, ${quote(t.trackingNo)},
                       ${quote(nn(t.note))})`,
            );
          } catch (err) {
            translateTrackingError(err, String(err));
          }
        }
        for (const i of input.items) {
          await exec.query(
            `INSERT INTO shipment_items
               (shipment_id, item_id, expected_qty, unit_price,
                production_date, expiry_date, line_note)
             VALUES (${quote(shipment.id)}, ${quote(i.itemId)}, ${quote(i.expectedQty)},
                     ${quote(nn(i.unitPrice))}, ${quote(nn(i.productionDate))},
                     ${quote(nn(i.expiryDate))}, ${quote(nn(i.lineNote))})`,
          );
        }
        await exec.query('COMMIT');
        return shipment;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async update(id: string, patch: UpdateShipmentInput): Promise<ShipmentRecord | null> {
      const existing = await this.findById(id);
      if (!existing) return null;
      if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_CONFLICT);

      const sets: string[] = [];
      if (patch.shipperUnitId !== undefined) sets.push(col('shipper_unit_id', patch.shipperUnitId));
      if (patch.receiverUnitId !== undefined) sets.push(col('receiver_unit_id', patch.receiverUnitId));
      if (patch.boxesCount !== undefined) sets.push(col('boxes_count', patch.boxesCount));
      if (patch.currency !== undefined) sets.push(col('currency', patch.currency));
      if (patch.expectedArrivalDate !== undefined) sets.push(col('expected_arrival_date', nn(patch.expectedArrivalDate)));
      if (patch.remark !== undefined) sets.push(col('remark', nn(patch.remark)));
      if (sets.length === 0) return existing;
      sets.push('updated_at = now()');

      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `UPDATE shipments SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
        );
        if (patch.trackings) {
          await exec.query(`DELETE FROM shipment_trackings WHERE shipment_id = ${quote(id)}`);
          for (const t of patch.trackings) {
            try {
              await exec.query(
                `INSERT INTO shipment_trackings (shipment_id, carrier, tracking_no, note)
                 VALUES (${quote(id)}, ${quote(t.carrier)}, ${quote(t.trackingNo)}, ${quote(nn(t.note))})`,
              );
            } catch (err) {
              translateTrackingError(err, String(err));
            }
          }
        }
        if (patch.items) {
          await exec.query(`DELETE FROM shipment_items WHERE shipment_id = ${quote(id)}`);
          for (const i of patch.items) {
            await exec.query(
              `INSERT INTO shipment_items
                 (shipment_id, item_id, expected_qty, unit_price,
                  production_date, expiry_date, line_note)
               VALUES (${quote(id)}, ${quote(i.itemId)}, ${quote(i.expectedQty)},
                       ${quote(nn(i.unitPrice))}, ${quote(nn(i.productionDate))},
                       ${quote(nn(i.expiryDate))}, ${quote(nn(i.lineNote))})`,
            );
          }
        }
        await exec.query('COMMIT');
        return rows[0] ? mapShipment(rows[0]) : null;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async send(id: string): Promise<ShipmentRecord | null> {
      const existing = await this.findById(id);
      if (!existing) return null;
      if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_CONFLICT);
      const { rows } = await exec.query(
        `UPDATE shipments SET status = 'SENT', sent_at = now(), updated_at = now()
         WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING *`,
      );
      return rows[0] ? mapShipment(rows[0]) : null;
    },
    async delete(id: string): Promise<boolean> {
      const existing = await this.findById(id);
      if (!existing) return false;
      if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_CONFLICT);
      const { rows } = await exec.query(
        `DELETE FROM shipments WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING id`,
      );
      return rows.length > 0;
    },
    async listTrackings(shipmentId: string): Promise<ShipmentTrackingRecord[]> {
      const { rows } = await exec.query(
        `SELECT * FROM shipment_trackings WHERE shipment_id = ${quote(shipmentId)} ORDER BY created_at ASC, id ASC`,
      );
      return rows.map(mapShipmentTracking);
    },
    async listTrackingsForShipments(ids: string[]): Promise<Map<string, ShipmentTrackingRecord[]>> {
      const map = new Map<string, ShipmentTrackingRecord[]>();
      for (const id of ids) map.set(id, []);
      if (ids.length === 0) return map;
      const inList = ids.map((id) => quote(id)).join(', ');
      const { rows } = await exec.query(
        `SELECT * FROM shipment_trackings WHERE shipment_id IN (${inList}) ORDER BY created_at ASC, id ASC`,
      );
      for (const row of rows) {
        const tracking = mapShipmentTracking(row);
        map.get(tracking.shipmentId)?.push(tracking);
      }
      return map;
    },
    async listItems(shipmentId: string): Promise<ShipmentItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT si.*, i.min_sale_unit AS min_sale_unit, i.name AS item_name,
                ${ITEM_SPEC_SQL} AS spec
         FROM shipment_items si
         LEFT JOIN items i ON i.id = si.item_id
         WHERE si.shipment_id = ${quote(shipmentId)} ORDER BY si.created_at ASC, si.id ASC`,
      );
      return rows.map(mapShipmentItem);
    },
    // ── 收货点货与差异协商─────────────────────────────────────────────
    async startCounting(id: string): Promise<ShipmentRecord | null> {
      const { rows } = await exec.query(
        `UPDATE shipments SET status = 'COUNTING', updated_at = now()
         WHERE id = ${quote(id)} AND status = 'SENT' RETURNING *`,
      );
      if (rows[0]) return mapShipment(rows[0]);
      const existing = await this.findById(id);
      if (!existing) return null;
      throw new Error(COUNTING_STATE_CONFLICT);
    },
    async saveCount(id: string, input: ShipmentCountRepoInput): Promise<SaveCountResult | null> {
      const existing = await this.findById(id);
      if (!existing) return null;

      const { rows: lineRows } = await exec.query(
        `SELECT id FROM shipment_items WHERE shipment_id = ${quote(id)}`,
      );
      const validIds = new Set(lineRows.map((r) => String(r.id)));
      for (const line of input.lines) {
        if (!validIds.has(line.shipmentItemId)) throw new Error(COUNT_LINE_INVALID);
      }

      await exec.query('BEGIN');
      try {
        // CAS：状态可点货且版本一致才递增版本号，防止并发保存互相覆盖。
        const { rows: locked } = await exec.query(
          `UPDATE shipments SET count_version = count_version + 1, updated_at = now()
           WHERE id = ${quote(id)} AND status IN ('COUNTING', 'DISCREPANCY')
             AND count_version = ${quote(input.version)}
           RETURNING *`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          throw new Error(COUNTING_STATE_CONFLICT);
        }
        for (const line of input.lines) {
          await exec.query(
            `UPDATE shipment_items
             SET actual_qty = ${quote(line.actualQty === '' ? null : line.actualQty)}, updated_at = now()
             WHERE id = ${quote(line.shipmentItemId)}`,
          );
        }
        // 重算：存在差异 → DISCREPANCY；全部一致 → READY；仍有未点 → COUNTING。
        const { rows: allRows } = await exec.query(
          `SELECT expected_qty, actual_qty FROM shipment_items
           WHERE shipment_id = ${quote(id)} ORDER BY created_at ASC, id ASC`,
        );
        let hasDifference = false;
        let allCounted = true;
        for (const row of allRows) {
          const actual = row.actual_qty;
          if (actual === null || actual === undefined || String(actual).trim() === '') {
            allCounted = false;
          } else if (Number(String(actual)) !== Number(String(row.expected_qty))) {
            hasDifference = true;
          }
        }
        const status = hasDifference ? 'DISCREPANCY' : allCounted ? 'READY' : 'COUNTING';
        const { rows: updated } = await exec.query(
          `UPDATE shipments SET status = ${quote(status)} WHERE id = ${quote(id)} RETURNING *`,
        );
        await exec.query('COMMIT');
        const shipment = mapShipment(updated[0]);
        return { shipment, countVersion: shipment.countVersion };
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async listReviews(shipmentId: string): Promise<DiscrepancyReviewRecord[]> {
      const { rows } = await exec.query(
        `SELECT * FROM discrepancy_reviews WHERE shipment_id = ${quote(shipmentId)}
         ORDER BY created_at DESC, id DESC`,
      );
      const reviews = rows.map(mapDiscrepancyReview);
      for (const review of reviews) {
        const { rows: itemRows } = await exec.query(
          `SELECT * FROM discrepancy_review_items WHERE review_id = ${quote(review.id)} ORDER BY id ASC`,
        );
        review.items = itemRows.map(mapDiscrepancyReviewItem);
      }
      return reviews;
    },
    async findReview(id: string): Promise<DiscrepancyReviewRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM discrepancy_reviews WHERE id = ${quote(id)} LIMIT 1`,
      );
      if (!rows[0]) return null;
      const review = mapDiscrepancyReview(rows[0]);
      const { rows: itemRows } = await exec.query(
        `SELECT * FROM discrepancy_review_items WHERE review_id = ${quote(id)} ORDER BY id ASC`,
      );
      review.items = itemRows.map(mapDiscrepancyReviewItem);
      return review;
    },
    async createReview(input: CreateReviewInput): Promise<DiscrepancyReviewRecord> {
      const shipment = await this.findById(input.shipmentId);
      if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');

      if (shipment.status !== 'DISCREPANCY') {
        const { rows } = await exec.query(
          `SELECT count(*)::int AS n FROM discrepancy_reviews
           WHERE shipment_id = ${quote(input.shipmentId)} AND status = 'PENDING'`,
        );
        if (Number(rows[0]?.n ?? 0) > 0) throw new Error(REVIEW_ALREADY_PROCESSED);
        throw new Error(REVIEW_NO_DIFFERENCE);
      }

      const shipmentItems = await this.listItems(input.shipmentId);
      const byId = new Map(shipmentItems.map((it) => [it.id, it]));
      let hasDifference = false;
      for (const line of input.lines) {
        const item = byId.get(line.shipmentItemId);
        if (!item) throw new Error(COUNT_LINE_INVALID);
        if (
          item.actualQty === null ||
          item.actualQty === '' ||
          Number(item.actualQty) === Number(item.expectedQty)
        ) {
          throw new Error(REVIEW_NO_DIFFERENCE);
        }
        hasDifference = true;
      }
      if (!hasDifference) throw new Error(REVIEW_NO_DIFFERENCE);

      await exec.query('BEGIN');
      try {
        let reviewId = '';
        try {
          const { rows } = await exec.query(
            `INSERT INTO discrepancy_reviews
               (shipment_id, status, reason, photo_file_ids, submitted_by)
             VALUES (${quote(input.shipmentId)}, 'PENDING', ${quote(nn(input.reason))},
                     ${photoArray(input.photoFileIds)}, ${quote(input.submittedBy)})
             RETURNING id`,
          );
          reviewId = String(rows[0].id);
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          if (/duplicate|unique|23505/i.test(text)) throw new Error(REVIEW_ALREADY_PROCESSED);
          throw err;
        }
        for (const line of input.lines) {
          const item = byId.get(line.shipmentItemId)!;
          await exec.query(
            `INSERT INTO discrepancy_review_items
               (review_id, shipment_item_id, expected_qty_before, actual_qty, reason)
             VALUES (${quote(reviewId)}, ${quote(line.shipmentItemId)}, ${quote(item.expectedQty)},
                     ${quote(line.actualQty)}, ${quote(nn(line.reason))})`,
          );
        }
        await exec.query(
          `UPDATE shipments SET status = 'REVIEW_PENDING', updated_at = now()
           WHERE id = ${quote(input.shipmentId)}`,
        );
        await exec.query('COMMIT');
        const review = await this.findReview(reviewId);
        if (!review) throw new Error('SHIPMENT_NOT_FOUND: review disappeared');
        return review;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async approveReview(
      id: string,
      reviewedBy: string | null,
    ): Promise<DiscrepancyReviewRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: reviewRows } = await exec.query(
          `SELECT * FROM discrepancy_reviews WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!reviewRows[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const review = mapDiscrepancyReview(reviewRows[0]);
        if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED);

        const { rows: itemRows } = await exec.query(
          `SELECT * FROM discrepancy_review_items WHERE review_id = ${quote(id)} ORDER BY id ASC`,
        );
        const items = itemRows.map(mapDiscrepancyReviewItem);
        const before: Record<string, string> = {};
        for (const item of items) {
          const current = await exec.query(
            `SELECT expected_qty FROM shipment_items WHERE id = ${quote(item.shipmentItemId)}`,
          );
          before[item.shipmentItemId] = String(current.rows[0]?.expected_qty ?? item.expectedQtyBefore);
          await exec.query(
            `UPDATE shipment_items SET expected_qty = ${quote(item.actualQty)}, updated_at = now()
             WHERE id = ${quote(item.shipmentItemId)}`,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE discrepancy_reviews
           SET status = 'APPROVED', reviewed_by = ${quote(reviewedBy)}, reviewed_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(REVIEW_ALREADY_PROCESSED);
        await exec.query(
          `UPDATE shipments SET status = 'READY', updated_at = now()
           WHERE id = ${quote(review.shipmentId)}`,
        );
        if (reviewedBy) {
          await exec.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before, after)
             VALUES (${quote(reviewedBy)}, 'REVIEW_APPROVED', 'discrepancy_review', ${quote(id)},
                     ${quote(JSON.stringify(before))},
                     ${quote(
                       JSON.stringify({
                         items: items.map((i) => ({
                           shipmentItemId: i.shipmentItemId,
                           expectedQtyBefore: i.expectedQtyBefore,
                           actualQty: i.actualQty,
                         })),
                       }),
                     )})`,
          );
        }
        await exec.query('COMMIT');
        return this.findReview(id);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async rejectReview(
      id: string,
      reviewedBy: string | null,
      reason: string,
    ): Promise<DiscrepancyReviewRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: reviewRows } = await exec.query(
          `SELECT * FROM discrepancy_reviews WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!reviewRows[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const review = mapDiscrepancyReview(reviewRows[0]);
        if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED);

        const { rows: updated } = await exec.query(
          `UPDATE discrepancy_reviews
           SET status = 'REJECTED', reason = ${quote(reason)}, reviewed_by = ${quote(reviewedBy)},
               reviewed_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(REVIEW_ALREADY_PROCESSED);
        await exec.query(
          `UPDATE shipments SET status = 'DISCREPANCY', updated_at = now()
           WHERE id = ${quote(review.shipmentId)}`,
        );
        await exec.query('COMMIT');
        return this.findReview(id);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };

  return shipments;
}
