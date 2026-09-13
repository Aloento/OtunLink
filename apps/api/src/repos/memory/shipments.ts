// 发货单内存仓库（shipments + trackings + items + reviews）。
import type { CreateReviewInput, CreateShipmentInput, DiscrepancyReviewItemRecord, DiscrepancyReviewRecord, SaveCountResult, ShipmentCountRepoInput, ShipmentItemRecord, ShipmentListQuery, ShipmentListResult, ShipmentRecord, ShipmentRepository, ShipmentTrackingRecord, UpdateShipmentInput } from '../../types';
import { resolveSpec } from '../item-spec';
import { normalizeEmpty, uuid } from './helpers';
import type { MemoryItemRepository } from './items';

// 存储行不含 name/spec/minSaleUnit：与 SQL 实现一致，展示字段读取时联表派生。
type ShipmentItemRow = Omit<ShipmentItemRecord, 'name' | 'spec' | 'minSaleUnit'>;

// 物流单号 / 状态冲突信号：内存实现用消息前缀标记，路由层据此映射 409。
const TRACKING_CONFLICT_MESSAGE = 'TRACKING_CONFLICT: carrier+tracking_no already exists';

const SHIPMENT_STATE_MESSAGE = 'SHIPMENT_STATE_CONFLICT: only DRAFT shipments can be edited or sent';

// 点货/差异协商业务信号（路由层映射为对应错误码）。
const COUNTING_STATE_MESSAGE =
  'COUNTING_STATE_CONFLICT: shipment is not in a countable state or version mismatch';

const COUNT_LINE_INVALID_MESSAGE = 'COUNT_LINE_INVALID: count line does not belong to the shipment';

const REVIEW_ALREADY_PROCESSED_MESSAGE =
  'REVIEW_ALREADY_PROCESSED: review already processed or pending review exists';

const REVIEW_NO_DIFFERENCE_MESSAGE = 'REVIEW_NO_DIFFERENCE: no discrepancy to review';

/** 单据编号 ：SH-YYYYMMDD-XXXX（UTC 日期 + 4 位当日序号）。 */
function shipmentNoDate(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

export class MemoryShipmentRepository implements ShipmentRepository {
  private rows = new Map<string, ShipmentRecord>();
  private trackings = new Map<string, ShipmentTrackingRecord[]>();
  private items = new Map<string, ShipmentItemRow[]>();
  private reviews = new Map<string, DiscrepancyReviewRecord>();
  private reviewItems = new Map<string, DiscrepancyReviewItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly itemRepo: MemoryItemRepository,
    seed: {
      shipments?: ShipmentRecord[];
      trackings?: ShipmentTrackingRecord[];
      items?: ShipmentItemRecord[];
      reviews?: DiscrepancyReviewRecord[];
    } = {},
  ) {
    for (const row of seed.shipments ?? []) this.rows.set(row.id, cloneShipment(row));
    for (const row of seed.trackings ?? []) {
      const list = this.trackings.get(row.shipmentId) ?? [];
      list.push(cloneShipmentTracking(row));
      this.trackings.set(row.shipmentId, list);
    }
    for (const row of seed.items ?? []) {
      const list = this.items.get(row.shipmentId) ?? [];
      list.push(toItemRow(row));
      this.items.set(row.shipmentId, list);
    }
    for (const row of seed.reviews ?? []) {
      this.reviews.set(row.id, cloneReview(row));
      if (row.items) this.reviewItems.set(row.id, row.items.map(cloneReviewItem));
    }
  }

  private nextShipmentNo(): string {
    const key = shipmentNoDate(new Date());
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `SH-${key}-${String(next).padStart(4, '0')}`;
  }

  private assertTrackingsAvailable(
    trackings: CreateShipmentInput['trackings'],
    excludeShipmentId?: string,
  ): void {
    for (const incoming of trackings) {
      for (const [shipmentId, rows] of this.trackings) {
        if (shipmentId === excludeShipmentId) continue;
        for (const row of rows) {
          if (row.carrier === incoming.carrier && row.trackingNo === incoming.trackingNo) {
            throw new Error(TRACKING_CONFLICT_MESSAGE);
          }
        }
      }
    }
  }

  async findById(id: string): Promise<ShipmentRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneShipment(row) : null;
  }

  async list(query: ShipmentListQuery): Promise<ShipmentListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) =>
        query.scopeUnitId
          ? row.shipperUnitId === query.scopeUnitId || row.receiverUnitId === query.scopeUnitId
          : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return {
      items: all.slice(start, start + size).map(cloneShipment),
      total: all.length,
      page,
      size,
    };
  }

  async create(input: CreateShipmentInput): Promise<ShipmentRecord> {
    this.assertTrackingsAvailable(input.trackings);
    const now = new Date();
    const row: ShipmentRecord = {
      id: uuid(),
      shipmentNo: this.nextShipmentNo(),
      shipperUnitId: input.shipperUnitId,
      receiverUnitId: input.receiverUnitId,
      status: 'DRAFT',
      boxesCount: input.boxesCount,
      currency: input.currency,
      expectedArrivalDate: normalizeEmpty(input.expectedArrivalDate),
      remark: normalizeEmpty(input.remark),
      sentAt: null,
      createdBy: input.createdBy,
      countVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, cloneShipment(row));

    this.trackings.set(
      row.id,
      input.trackings.map((t) => ({
        id: uuid(),
        shipmentId: row.id,
        carrier: t.carrier,
        trackingNo: t.trackingNo,
        note: normalizeEmpty(t.note),
        createdAt: now,
      })),
    );
    this.items.set(
      row.id,
      input.items.map((i) => ({
        id: uuid(),
        shipmentId: row.id,
        itemId: i.itemId,
        expectedQty: i.expectedQty,
        actualQty: null,
        unitPrice: normalizeEmpty(i.unitPrice),
        productionDate: normalizeEmpty(i.productionDate),
        expiryDate: normalizeEmpty(i.expiryDate),
        lineNote: normalizeEmpty(i.lineNote),
        createdAt: now,
        updatedAt: now,
      })),
    );
    return cloneShipment(row);
  }

  async update(id: string, patch: UpdateShipmentInput): Promise<ShipmentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_MESSAGE);

    if (patch.trackings) this.assertTrackingsAvailable(patch.trackings, id);

    const next: ShipmentRecord = {
      ...existing,
      ...(patch.shipperUnitId !== undefined ? { shipperUnitId: patch.shipperUnitId } : {}),
      ...(patch.receiverUnitId !== undefined ? { receiverUnitId: patch.receiverUnitId } : {}),
      ...(patch.boxesCount !== undefined ? { boxesCount: patch.boxesCount } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.expectedArrivalDate !== undefined
        ? { expectedArrivalDate: normalizeEmpty(patch.expectedArrivalDate) }
        : {}),
      ...(patch.remark !== undefined ? { remark: normalizeEmpty(patch.remark) } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneShipment(next));

    if (patch.trackings) {
      const now = new Date();
      this.trackings.set(
        id,
        patch.trackings.map((t) => ({
          id: uuid(),
          shipmentId: id,
          carrier: t.carrier,
          trackingNo: t.trackingNo,
          note: normalizeEmpty(t.note),
          createdAt: now,
        })),
      );
    }
    if (patch.items) {
      const now = new Date();
      this.items.set(
        id,
        patch.items.map((i) => ({
          id: uuid(),
          shipmentId: id,
          itemId: i.itemId,
          expectedQty: i.expectedQty,
          actualQty: null,
          unitPrice: normalizeEmpty(i.unitPrice),
          productionDate: normalizeEmpty(i.productionDate),
          expiryDate: normalizeEmpty(i.expiryDate),
          lineNote: normalizeEmpty(i.lineNote),
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    return cloneShipment(next);
  }

  async send(id: string): Promise<ShipmentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_MESSAGE);
    const next: ShipmentRecord = {
      ...existing,
      status: 'SENT',
      sentAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneShipment(next));
    return cloneShipment(next);
  }

  async listTrackings(shipmentId: string): Promise<ShipmentTrackingRecord[]> {
    return (this.trackings.get(shipmentId) ?? []).map(cloneShipmentTracking);
  }

  async listTrackingsForShipments(ids: string[]): Promise<Map<string, ShipmentTrackingRecord[]>> {
    const map = new Map<string, ShipmentTrackingRecord[]>();
    for (const id of ids) {
      map.set(id, (this.trackings.get(id) ?? []).map(cloneShipmentTracking));
    }
    return map;
  }

  async listItems(shipmentId: string): Promise<ShipmentItemRecord[]> {
    const rows = this.items.get(shipmentId) ?? [];
    const hydrated: ShipmentItemRecord[] = [];
    for (const row of rows) {
      const item = row.itemId ? await this.itemRepo.findById(row.itemId) : null;
      hydrated.push(
        cloneShipmentItem({
          ...row,
          name: item?.name ?? '',
          spec: resolveSpec(item),
          minSaleUnit: item?.minSaleUnit ?? null,
        }),
      );
    }
    return hydrated;
  }

  async startCounting(id: string): Promise<ShipmentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'SENT') throw new Error(COUNTING_STATE_MESSAGE);
    const next: ShipmentRecord = {
      ...existing,
      status: 'COUNTING',
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneShipment(next));
    return cloneShipment(next);
  }

  async saveCount(id: string, input: ShipmentCountRepoInput): Promise<SaveCountResult | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'COUNTING' && existing.status !== 'DISCREPANCY') {
      throw new Error(COUNTING_STATE_MESSAGE);
    }
    if (existing.countVersion !== input.version) throw new Error(COUNTING_STATE_MESSAGE);

    const shipmentItems = this.items.get(id) ?? [];
    const byId = new Map(shipmentItems.map((it) => [it.id, it]));
    const nextItems = shipmentItems.map((it) => {
      const line = input.lines.find((l) => l.shipmentItemId === it.id);
      if (!line) return it;
      return {
        ...it,
        actualQty: line.actualQty === '' ? null : line.actualQty,
        updatedAt: new Date(),
      };
    });
    const cloneById = new Map(nextItems.map((it) => [it.id, it]));
    for (const line of input.lines) {
      if (!cloneById.has(line.shipmentItemId)) throw new Error(COUNT_LINE_INVALID_MESSAGE);
      if (!byId.has(line.shipmentItemId)) throw new Error(COUNT_LINE_INVALID_MESSAGE);
    }

    let hasDifference = false;
    let allCounted = true;
    for (const it of nextItems) {
      const actualEmpty = it.actualQty === null || it.actualQty === '';
      if (actualEmpty) {
        allCounted = false;
      } else if (compareQty(it.actualQty, it.expectedQty) !== 0) {
        hasDifference = true;
      }
    }
    const status = hasDifference ? 'DISCREPANCY' : allCounted ? 'READY' : 'COUNTING';

    const next: ShipmentRecord = {
      ...existing,
      status,
      countVersion: existing.countVersion + 1,
      updatedAt: new Date(),
    };
    this.items.set(id, nextItems);
    this.rows.set(id, cloneShipment(next));
    return { shipment: cloneShipment(next), countVersion: next.countVersion };
  }

  async createReview(input: CreateReviewInput): Promise<DiscrepancyReviewRecord> {
    const shipment = this.rows.get(input.shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    const pending = [...this.reviews.values()].find(
      (r) => r.shipmentId === input.shipmentId && r.status === 'PENDING',
    );
    if (shipment.status !== 'DISCREPANCY') {
      if (pending) throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);
      throw new Error(REVIEW_NO_DIFFERENCE_MESSAGE);
    }
    if (pending) throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);

    const shipmentItems = this.items.get(input.shipmentId) ?? [];
    const byId = new Map(shipmentItems.map((it) => [it.id, it]));
    let hasDifference = false;
    const now = new Date();
    const itemRows: DiscrepancyReviewItemRecord[] = input.lines.map((line) => {
      const item = byId.get(line.shipmentItemId);
      if (!item) throw new Error(COUNT_LINE_INVALID_MESSAGE);
      if (item.actualQty === null || item.actualQty === '' || compareQty(item.actualQty, item.expectedQty) === 0) {
        throw new Error(REVIEW_NO_DIFFERENCE_MESSAGE);
      }
      hasDifference = true;
      return {
        id: uuid(),
        reviewId: '', // review id 在下方创建后统一赋值
        shipmentItemId: line.shipmentItemId,
        expectedQtyBefore: item.expectedQty ?? '0',
        actualQty: line.actualQty,
        reason: normalizeEmpty(line.reason),
      };
    });
    if (!hasDifference) throw new Error(REVIEW_NO_DIFFERENCE_MESSAGE);

    const review: DiscrepancyReviewRecord = {
      id: uuid(),
      shipmentId: input.shipmentId,
      status: 'PENDING',
      reason: normalizeEmpty(input.reason),
      photoFileIds: [...input.photoFileIds],
      submittedBy: input.submittedBy,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const finalItems = itemRows.map((r) => ({ ...r, reviewId: review.id }));
    this.reviewItems.set(review.id, finalItems);
    this.reviews.set(review.id, cloneReview(review));

    this.rows.set(
      input.shipmentId,
      cloneShipment({ ...shipment, status: 'REVIEW_PENDING', updatedAt: now }),
    );
    return { ...cloneReview(review), items: finalItems };
  }

  async listReviews(shipmentId: string): Promise<DiscrepancyReviewRecord[]> {
    const list = [...this.reviews.values()]
      .filter((r) => r.shipmentId === shipmentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list.map((r) => ({ ...cloneReview(r), items: this.reviewItemsFor(r.id) }));
  }

  private reviewItemsFor(reviewId: string): DiscrepancyReviewItemRecord[] {
    return (this.reviewItems.get(reviewId) ?? []).map(cloneReviewItem);
  }

  async findReview(id: string): Promise<DiscrepancyReviewRecord | null> {
    const review = this.reviews.get(id);
    if (!review) return null;
    return { ...cloneReview(review), items: this.reviewItemsFor(id) };
  }

  async approveReview(id: string, reviewedBy: string | null): Promise<DiscrepancyReviewRecord | null> {
    const review = this.reviews.get(id);
    if (!review) return null;
    if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);
    const now = new Date();
    const nextReview: DiscrepancyReviewRecord = {
      ...review,
      status: 'APPROVED',
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    };
    this.reviews.set(id, cloneReview(nextReview));

    const shipment = this.rows.get(review.shipmentId);
    if (shipment) {
      const rows = (this.items.get(shipment.id) ?? []).map((it) => {
        const reviewItem = this.reviewItemsFor(id).find((ri) => ri.shipmentItemId === it.id);
        if (!reviewItem) return it;
        return { ...it, expectedQty: reviewItem.actualQty, updatedAt: now };
      });
      this.items.set(shipment.id, rows);
      this.rows.set(
        shipment.id,
        cloneShipment({ ...shipment, status: 'READY', updatedAt: now }),
      );
    }
    return { ...cloneReview(nextReview), items: this.reviewItemsFor(id) };
  }

  async rejectReview(
    id: string,
    reviewedBy: string | null,
    reason: string,
  ): Promise<DiscrepancyReviewRecord | null> {
    const review = this.reviews.get(id);
    if (!review) return null;
    if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);
    const now = new Date();
    const nextReview: DiscrepancyReviewRecord = {
      ...review,
      status: 'REJECTED',
      reason,
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    };
    this.reviews.set(id, cloneReview(nextReview));

    const shipment = this.rows.get(review.shipmentId);
    if (shipment) {
      this.rows.set(
        shipment.id,
        cloneShipment({ ...shipment, status: 'DISCREPANCY', updatedAt: now }),
      );
    }
    return { ...cloneReview(nextReview), items: this.reviewItemsFor(id) };
  }

  /** 内部状态流转：入库/退货仓储复用，直接覆盖发货单状态。 */
  transitionTo(id: string, status: ShipmentRecord['status']): void {
    const shipment = this.rows.get(id);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    this.rows.set(id, cloneShipment({ ...shipment, status, updatedAt: new Date() }));
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  referencesUnit(unitId: string): boolean {
    for (const row of this.rows.values()) {
      if (row.shipperUnitId === unitId || row.receiverUnitId === unitId) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing) return false;
    if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_MESSAGE);
    // 手动级联删除子表（DB 已 ON DELETE CASCADE）。
    for (const reviewId of [...this.reviews.keys()]) {
      if (this.reviews.get(reviewId)?.shipmentId === id) {
        this.reviews.delete(reviewId);
        this.reviewItems.delete(reviewId);
      }
    }
    this.trackings.delete(id);
    this.items.delete(id);
    return this.rows.delete(id);
  }
}

function cloneShipment(row: ShipmentRecord): ShipmentRecord {
  return {
    ...row,
    sentAt: row.sentAt ? new Date(row.sentAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneShipmentTracking(row: ShipmentTrackingRecord): ShipmentTrackingRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function cloneShipmentItem(row: ShipmentItemRecord): ShipmentItemRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** 种子/入参 → 存储行：剔除联表派生的展示字段。 */
function toItemRow(row: ShipmentItemRecord): ShipmentItemRow {
  return {
    id: row.id,
    shipmentId: row.shipmentId,
    itemId: row.itemId,
    expectedQty: row.expectedQty,
    actualQty: row.actualQty,
    unitPrice: row.unitPrice,
    productionDate: row.productionDate,
    expiryDate: row.expiryDate,
    lineNote: row.lineNote,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneReviewItem(row: DiscrepancyReviewItemRecord): DiscrepancyReviewItemRecord {
  return { ...row };
}

function cloneReview(row: DiscrepancyReviewRecord): DiscrepancyReviewRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

// ── 内存实现：确认入库 + 发货退货。 ────────────────────────────────────

/** 数量比较：null/undefined 按 0 处理，返回 -1/0/1。 */
function compareQty(a: string | null | undefined, b: string | null | undefined): number {
  const na = Number(a ?? 0);
  const nb = Number(b ?? 0);
  return na === nb ? 0 : na > nb ? 1 : -1;
}
