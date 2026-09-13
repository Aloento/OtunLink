// 出库单内存仓库（outbound_orders + items）。
import type { CreateOutboundRepoInput, OutboundListQuery, OutboundListResult, OutboundOrderItemRecord, OutboundOrderRecord, OutboundRepository, UpdateOutboundRepoInput } from '../../types';
import { INSUFFICIENT_STOCK_MESSAGE, normalizeEmpty, uuid } from './helpers';
import type { MemoryStockLedger } from './ledger';

const OUTBOUND_STATE_CONFLICT_MESSAGE =
  'OUTBOUND_STATE_CONFLICT: only DRAFT outbound orders can be posted';

function cloneOutbound(row: OutboundOrderRecord): OutboundOrderRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    postedAt: row.postedAt ? new Date(row.postedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneOutboundItem(row: OutboundOrderItemRecord): OutboundOrderItemRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

export class MemoryOutboundRepository implements OutboundRepository {
  private rows = new Map<string, OutboundOrderRecord>();
  private items = new Map<string, OutboundOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly ledger: MemoryStockLedger,
    seed: { outbounds?: OutboundOrderRecord[]; outboundItems?: OutboundOrderItemRecord[] } = {},
  ) {
    for (const row of seed.outbounds ?? []) this.rows.set(row.id, cloneOutbound(row));
    for (const row of seed.outboundItems ?? []) {
      const list = this.items.get(row.outboundOrderId) ?? [];
      list.push(cloneOutboundItem(row));
      this.items.set(row.outboundOrderId, list);
    }
  }

  private nextOutboundNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `OB-${key}-${String(next).padStart(4, '0')}`;
  }

  async list(query: OutboundListQuery): Promise<OutboundListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) => (query.type ? row.type === query.type : true))
      .filter((row) => (query.warehouseUnitId ? row.warehouseUnitId === query.warehouseUnitId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return { items: all.slice(start, start + size).map(cloneOutbound), total: all.length, page, size };
  }

  async findById(id: string): Promise<OutboundOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneOutbound(row) : null;
  }

  async listItems(outboundOrderId: string): Promise<OutboundOrderItemRecord[]> {
    return (this.items.get(outboundOrderId) ?? []).map(cloneOutboundItem);
  }

  async create(input: CreateOutboundRepoInput): Promise<OutboundOrderRecord> {
    const now = new Date();
    const order: OutboundOrderRecord = {
      id: uuid(),
      outboundNo: this.nextOutboundNo(),
      type: input.type ?? 'NORMAL',
      warehouseUnitId: input.warehouseUnitId,
      counterpartyUnitId: normalizeEmpty(input.counterpartyUnitId),
      status: 'DRAFT',
      lossReason: input.lossReason ?? null,
      photoFileIds: [...input.photoFileIds],
      remark: normalizeEmpty(input.remark),
      postedBy: null,
      postedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(order.id, cloneOutbound(order));
    this.items.set(
      order.id,
      input.lines.map((line) => ({
        id: uuid(),
        outboundOrderId: order.id,
        itemId: line.itemId,
        batchId: line.batchId ?? null,
        qty: line.qty,
        unitCost: null,
        createdAt: now,
      })).map(cloneOutboundItem),
    );
    return cloneOutbound(order);
  }

  async update(
    id: string,
    input: UpdateOutboundRepoInput,
  ): Promise<OutboundOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT_MESSAGE);
    const now = new Date();
    const next: OutboundOrderRecord = {
      ...existing,
      type: input.type ?? 'NORMAL',
      warehouseUnitId: input.warehouseUnitId,
      counterpartyUnitId: normalizeEmpty(input.counterpartyUnitId),
      lossReason: input.lossReason ?? null,
      photoFileIds: [...input.photoFileIds],
      remark: normalizeEmpty(input.remark),
      updatedAt: now,
    };
    this.rows.set(id, cloneOutbound(next));
    this.items.set(
      id,
      input.lines.map((line) => ({
        id: uuid(),
        outboundOrderId: id,
        itemId: line.itemId,
        batchId: line.batchId ?? null,
        qty: line.qty,
        unitCost: null,
        createdAt: now,
      })).map(cloneOutboundItem),
    );
    return cloneOutbound(next);
  }

  async post(id: string, postedBy: string): Promise<OutboundOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT_MESSAGE);

    const now = new Date();
    const allocated: OutboundOrderItemRecord[] = [];
    // 报损（type=LOSS）→ OUTBOUND_LOSS 流水；手工出库 → OUTBOUND_NORMAL。
    const movementType = existing.type === 'LOSS' ? 'OUTBOUND_LOSS' : 'OUTBOUND_NORMAL';
    for (const line of this.items.get(id) ?? []) {
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(INSUFFICIENT_STOCK_MESSAGE);
      // FEFO 自动分配（line.batchId 缺省）或指定批次；可能拆分为多行。
      const allocations = this.ledger.applyOutbound({
        unitId: existing.warehouseUnitId,
        itemId: line.itemId,
        qty,
        batchId: line.batchId,
        type: movementType,
        orderType: 'outbound',
        orderId: existing.id,
        refNo: existing.outboundNo,
        operatorId: postedBy,
      });
      for (const alloc of allocations) {
        allocated.push({
          id: uuid(),
          outboundOrderId: existing.id,
          itemId: line.itemId,
          batchId: alloc.batchId,
          qty: alloc.qty.toFixed(2),
          unitCost: alloc.unitCost.toFixed(2),
          createdAt: now,
        });
      }
    }
    this.items.set(id, allocated.map(cloneOutboundItem));

    const next: OutboundOrderRecord = {
      ...existing,
      status: 'POSTED',
      postedBy,
      postedAt: now,
      updatedAt: now,
    };
    this.rows.set(id, cloneOutbound(next));
    return cloneOutbound(next);
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  referencesUnit(unitId: string): boolean {
    for (const row of this.rows.values()) {
      if (row.warehouseUnitId === unitId || row.counterpartyUnitId === unitId) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing) return false;
    if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT_MESSAGE);
    this.items.delete(id);
    return this.rows.delete(id);
  }
}
