// 入库单内存仓库（inbound_orders + items）。
import type { ConfirmReceiptRepoInput, CreateInboundManualRepoInput, InboundListQuery, InboundListResult, InboundOrderItemRecord, InboundOrderRecord, InboundRepository, ItemRepository, ShipmentItemRecord, ShipmentRecord } from '../../types';
import { ensureBatchNo } from '../../lib/batch';
import { mergeInboundLines, qtyEqual } from '../inbound-lines';
import { normalizeEmpty, uuid } from './helpers';
import { MemoryStockLedger, type MemoryBatchRecord, type MemoryStockMovementRecord, type MemoryStockRecord } from './ledger';
import type { MemoryShipmentRepository } from './shipments';

// 确认入库 / 发货退货业务信号（路由层映射为对应错误码）。
const SHIPMENT_NOT_READY_MESSAGE = 'SHIPMENT_NOT_READY: shipment is not READY or lines mismatch';

const INBOUND_STATE_CONFLICT_MESSAGE = 'INBOUND_STATE_CONFLICT: only DRAFT inbound orders can be posted';

function cloneInbound(row: InboundOrderRecord): InboundOrderRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    postedAt: row.postedAt ? new Date(row.postedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneInboundItem(row: InboundOrderItemRecord): InboundOrderItemRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

export class MemoryInboundRepository implements InboundRepository {
  private rows = new Map<string, InboundOrderRecord>();
  private items = new Map<string, InboundOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  /** 测试可检查的批次 / 库存 / 台账快照（委托共享台账）。 */
  get batches(): Map<string, MemoryBatchRecord> {
    return this.ledger.batches;
  }
  get stock(): Map<string, MemoryStockRecord> {
    return this.ledger.stock;
  }
  get movements(): MemoryStockMovementRecord[] {
    return this.ledger.movements;
  }

  constructor(
    private readonly shipmentRepo: MemoryShipmentRepository,
    private readonly itemRepo: ItemRepository,
    seed: { inbounds?: InboundOrderRecord[]; inboundItems?: InboundOrderItemRecord[] } = {},
    private readonly ledger: MemoryStockLedger = new MemoryStockLedger(),
  ) {
    for (const row of seed.inbounds ?? []) this.rows.set(row.id, cloneInbound(row));
    for (const row of seed.inboundItems ?? []) {
      const list = this.items.get(row.inboundOrderId) ?? [];
      list.push(cloneInboundItem(row));
      this.items.set(row.inboundOrderId, list);
    }
  }

  private nextInboundNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `IB-${key}-${String(next).padStart(4, '0')}`;
  }

  /** 非易腐物品的生产/到期日清空为 null；易腐物品原样保留。 */
  private async perishableDates(
    itemId: string,
    productionDate: string | null,
    expiryDate: string | null,
  ): Promise<{ productionDate: string | null; expiryDate: string | null }> {
    const item = await this.itemRepo.findById(itemId);
    return item && item.isPerishable
      ? { productionDate, expiryDate }
      : { productionDate: null, expiryDate: null };
  }

  /** 新建手动入库单（sourceType=MANUAL, DRAFT）。 */
  async createManual(input: CreateInboundManualRepoInput): Promise<InboundOrderRecord> {
    const now = new Date();
    const inbound: InboundOrderRecord = {
      id: uuid(),
      inboundNo: this.nextInboundNo(),
      sourceType: 'MANUAL',
      shipmentId: null,
      warehouseUnitId: input.warehouseUnitId,
      counterpartyUnitId: normalizeEmpty(input.counterpartyUnitId),
      status: 'DRAFT',
      remark: normalizeEmpty(input.remark),
      photoFileIds: [...input.photoFileIds],
      postedBy: null,
      postedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(inbound.id, cloneInbound(inbound));
    const itemRows: InboundOrderItemRecord[] = [];
    for (const line of input.lines) {
      const dates = await this.perishableDates(
        line.itemId,
        normalizeEmpty(line.productionDate),
        normalizeEmpty(line.expiryDate),
      );
      itemRows.push({
        id: uuid(),
        inboundOrderId: inbound.id,
        itemId: line.itemId,
        batchId: null,
        qty: line.qty,
        unitCost: line.unitCost ?? '0',
        lineNote: normalizeEmpty(line.lineNote),
        productionDate: dates.productionDate,
        expiryDate: dates.expiryDate,
        batchNo: normalizeEmpty(line.batchNo),
        createdAt: now,
      });
    }
    this.items.set(inbound.id, itemRows.map(cloneInboundItem));
    return cloneInbound(inbound);
  }

  /**
   * 内部入库建档：按 qtyFor 计算各发货行入库数量 → mergeInboundLines 归并 →
   * 建 DRAFT 入库单 + 明细；并（可选）翻转发货单状态。partial（部分退货剩余）不翻转。
   */
  private async createDraftFromShipment(params: {
    shipment: ShipmentRecord;
    shipmentItems: ShipmentItemRecord[];
    qtyFor: (item: ShipmentItemRecord) => string | null;
    batchNoFor: (item: ShipmentItemRecord) => string | null;
    createdBy: string;
    remark: string | null;
    photoFileIds: string[];
    flipShipmentStatus: boolean;
  }): Promise<InboundOrderRecord> {
    const merged = mergeInboundLines(
      params.shipmentItems,
      params.qtyFor,
      params.batchNoFor,
      params.shipment.shipmentNo,
    );
    if (merged.length === 0) throw new Error(SHIPMENT_NOT_READY_MESSAGE);

    const now = new Date();
    const inbound: InboundOrderRecord = {
      id: uuid(),
      inboundNo: this.nextInboundNo(),
      sourceType: 'SHIPMENT',
      shipmentId: params.shipment.id,
      warehouseUnitId: params.shipment.receiverUnitId,
      counterpartyUnitId: params.shipment.shipperUnitId,
      status: 'DRAFT',
      remark: normalizeEmpty(params.remark),
      photoFileIds: [...params.photoFileIds],
      postedBy: null,
      postedAt: null,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(inbound.id, cloneInbound(inbound));
    const itemRows: InboundOrderItemRecord[] = [];
    for (const line of merged) {
      const dates = await this.perishableDates(
        line.itemId,
        normalizeEmpty(line.productionDate),
        normalizeEmpty(line.expiryDate),
      );
      itemRows.push({
        id: uuid(),
        inboundOrderId: inbound.id,
        itemId: line.itemId,
        batchId: null,
        qty: line.qty,
        unitCost: line.unitCost,
        lineNote: null,
        productionDate: dates.productionDate,
        expiryDate: dates.expiryDate,
        batchNo: normalizeEmpty(line.batchNo),
        createdAt: now,
      });
    }
    this.items.set(inbound.id, itemRows.map(cloneInboundItem));

    if (params.flipShipmentStatus) {
      this.shipmentRepo.transitionTo(inbound.shipmentId!, 'INBOUNDED');
    }
    return cloneInbound(inbound);
  }

  async list(query: InboundListQuery): Promise<InboundListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) => (query.warehouseUnitId ? row.warehouseUnitId === query.warehouseUnitId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return { items: all.slice(start, start + size).map(cloneInbound), total: all.length, page, size };
  }

  async findById(id: string): Promise<InboundOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneInbound(row) : null;
  }

  async listItems(inboundOrderId: string): Promise<InboundOrderItemRecord[]> {
    return (this.items.get(inboundOrderId) ?? []).map(cloneInboundItem);
  }

  async confirmReceipt(
    shipmentId: string,
    input: ConfirmReceiptRepoInput,
  ): Promise<InboundOrderRecord> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    if (shipment.status !== 'READY') throw new Error(SHIPMENT_NOT_READY_MESSAGE);

    const shipmentItems = await this.shipmentRepo.listItems(shipmentId);
    if (shipmentItems.length === 0) throw new Error(SHIPMENT_NOT_READY_MESSAGE);
    for (const item of shipmentItems) {
      if (!item.itemId) throw new Error(SHIPMENT_NOT_READY_MESSAGE);
      if (item.actualQty === null || item.actualQty === '' || !qtyEqual(item.actualQty, item.expectedQty)) {
        throw new Error(SHIPMENT_NOT_READY_MESSAGE);
      }
    }
    const validIds = new Set(shipmentItems.map((i) => i.id));
    for (const line of input.lines) {
      if (!validIds.has(line.shipmentItemId)) throw new Error(SHIPMENT_NOT_READY_MESSAGE);
    }
    const batchNoByItem = new Map(input.lines.map((l) => [l.shipmentItemId, l.batchNo ?? null]));

    return this.createDraftFromShipment({
      shipment,
      shipmentItems,
      qtyFor: (item) => item.actualQty,
      batchNoFor: (item) => batchNoByItem.get(item.id) ?? null,
      createdBy: input.createdBy,
      remark: input.remark,
      photoFileIds: input.photoFileIds,
      flipShipmentStatus: true,
    });
  }

  /** 部分退货接受时，按剩余数量建档 DRAFT 入库单（不翻转发货单状态）。 */
  async confirmReceiptRemainder(
    shipmentId: string,
    qtyFor: (item: ShipmentItemRecord) => string | null,
    createdBy: string,
  ): Promise<InboundOrderRecord | null> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) return null;
    const shipmentItems = await this.shipmentRepo.listItems(shipmentId);
    const merged = mergeInboundLines(shipmentItems, qtyFor, () => null, shipment.shipmentNo);
    if (merged.length === 0) return null;
    return this.createDraftFromShipment({
      shipment,
      shipmentItems,
      qtyFor,
      batchNoFor: () => null,
      createdBy,
      remark: null,
      photoFileIds: [],
      flipShipmentStatus: false,
    });
  }

  async post(id: string, postedBy: string): Promise<InboundOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(INBOUND_STATE_CONFLICT_MESSAGE);

    const now = new Date();
    const itemRows: InboundOrderItemRecord[] = [];
    for (const row of this.items.get(id) ?? []) {
      const dates = await this.perishableDates(row.itemId, row.productionDate, row.expiryDate);
      const batch: MemoryBatchRecord = {
        id: uuid(),
        itemId: row.itemId,
        batchNo: ensureBatchNo(row.itemId, row.batchNo),
        productionDate: dates.productionDate,
        expiryDate: dates.expiryDate,
        sourceType: existing.sourceType,
        sourceOrderId: existing.shipmentId,
        createdBy: postedBy,
      };
      this.ledger.applyInbound({
        unitId: existing.warehouseUnitId,
        itemId: row.itemId,
        batch,
        qty: Number(row.qty),
        unitCost: Number(row.unitCost),
        type: existing.sourceType === 'MANUAL' ? 'INBOUND_MANUAL' : 'INBOUND_SHIPMENT',
        orderType: 'inbound',
        orderId: existing.id,
        refNo: existing.inboundNo,
        operatorId: postedBy,
      });
      itemRows.push({ ...row, batchId: batch.id });
    }
    this.items.set(id, itemRows.map(cloneInboundItem));

    const next: InboundOrderRecord = {
      ...existing,
      status: 'POSTED',
      postedBy,
      postedAt: now,
      updatedAt: now,
    };
    this.rows.set(id, cloneInbound(next));
    return cloneInbound(next);
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
    if (existing.status !== 'DRAFT') throw new Error(INBOUND_STATE_CONFLICT_MESSAGE);
    this.items.delete(id);
    return this.rows.delete(id);
  }
}
