// 退货单内存仓库（return_orders + items）。
import type { CreateReturnRepoInput, CreateSalesReturnRepoInput, ReturnListQuery, ReturnListResult, ReturnOrderItemRecord, ReturnOrderRecord, ReturnRepository, SalesReturnReceiveLineInput } from '../../types';
import { ensureBatchNo } from '../../lib/batch';
import { SALES_STATE_CONFLICT_MESSAGE, normalizeEmpty, round2, uuid } from './helpers';
import type { MemoryInboundRepository } from './inbounds';
import type { MemoryStockLedger } from './ledger';
import type { MemorySalesRepository } from './sales';
import type { MemoryShipmentRepository } from './shipments';

const RETURN_STATE_CONFLICT_MESSAGE = 'RETURN_STATE_CONFLICT: shipment is not READY for return';

const RETURN_ALREADY_PROCESSED_MESSAGE = 'RETURN_ALREADY_PROCESSED: return order already processed';

const RETURN_LINE_INVALID_MESSAGE = 'RETURN_LINE_INVALID: return line is invalid';

const RETURN_QTY_EXCEEDED_MESSAGE = 'RETURN_QTY_EXCEEDED: return qty exceeds returnable';

function cloneReturn(row: ReturnOrderRecord): ReturnOrderRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneReturnItem(row: ReturnOrderItemRecord): ReturnOrderItemRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

export class MemoryReturnRepository implements ReturnRepository {
  private rows = new Map<string, ReturnOrderRecord>();
  private items = new Map<string, ReturnOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly shipmentRepo: MemoryShipmentRepository,
    private readonly inboundRepo: MemoryInboundRepository,
    private readonly salesRepo: MemorySalesRepository,
    private readonly ledger: MemoryStockLedger,
    seed: { returns?: ReturnOrderRecord[]; returnItems?: ReturnOrderItemRecord[] } = {},
  ) {
    for (const row of seed.returns ?? []) this.rows.set(row.id, cloneReturn(row));
    for (const row of seed.returnItems ?? []) {
      const list = this.items.get(row.returnOrderId) ?? [];
      list.push(cloneReturnItem(row));
      this.items.set(row.returnOrderId, list);
    }
  }

  private nextReturnNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `RT-${key}-${String(next).padStart(4, '0')}`;
  }

  async list(query: ReturnListQuery): Promise<ReturnListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) => (query.sourceType ? row.sourceType === query.sourceType : true))
      .filter((row) => (query.salesOrderId ? row.salesOrderId === query.salesOrderId : true))
      .filter((row) =>
        query.scopeUnitId
          ? row.fromUnitId === query.scopeUnitId || row.toUnitId === query.scopeUnitId
          : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return { items: all.slice(start, start + size).map(cloneReturn), total: all.length, page, size };
  }

  async findById(id: string): Promise<ReturnOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneReturn(row) : null;
  }

  async listItems(returnOrderId: string): Promise<ReturnOrderItemRecord[]> {
    return (this.items.get(returnOrderId) ?? []).map((row) => {
      const batch = row.originalBatchId ? this.ledger.batches.get(row.originalBatchId) : undefined;
      return cloneReturnItem({
        ...row,
        pendingQc: batch?.sourceType === 'RETURNS_PENDING',
      });
    });
  }

  async createReturn(input: CreateReturnRepoInput): Promise<ReturnOrderRecord> {
    const shipment = await this.shipmentRepo.findById(input.shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    if (shipment.status !== 'READY') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);

    const shipmentItems = await this.shipmentRepo.listItems(shipment.id);
    const byId = new Map(shipmentItems.map((i) => [i.id, i]));
    const lines: { shipmentItemId: string; itemId: string; qty: string; reason: string | null }[] = [];
    for (const line of input.lines) {
      const item = byId.get(line.shipmentItemId);
      if (!item || !item.itemId) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0 || qty > Number(item.expectedQty)) {
        throw new Error(RETURN_LINE_INVALID_MESSAGE);
      }
      lines.push({
        shipmentItemId: item.id,
        itemId: item.itemId,
        qty: qty.toFixed(2),
        reason: normalizeEmpty(line.reason),
      });
    }
    if (lines.length === 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);

    const now = new Date();
    const order: ReturnOrderRecord = {
      id: uuid(),
      returnNo: this.nextReturnNo(),
      sourceType: 'SHIPMENT',
      shipmentId: shipment.id,
      salesOrderId: null,
      fromUnitId: shipment.receiverUnitId,
      toUnitId: shipment.shipperUnitId,
      status: 'PENDING',
      reason: normalizeEmpty(input.reason),
      note: normalizeEmpty(input.note),
      photoFileIds: [...input.photoFileIds],
      returnCarrier: normalizeEmpty(input.returnCarrier),
      returnTrackingNo: normalizeEmpty(input.returnTrackingNo),
      createdBy: input.createdBy,
      processedBy: null,
      processedAt: null,
      processedNote: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(order.id, cloneReturn(order));
    const itemRows: ReturnOrderItemRecord[] = lines.map((line) => ({
      id: uuid(),
      returnOrderId: order.id,
      itemId: line.itemId,
      shipmentItemId: line.shipmentItemId,
      salesOrderItemId: null,
      qty: line.qty,
      receivedQty: null,
      originalBatchId: null,
      reason: line.reason,
      createdAt: now,
    }));
    this.items.set(order.id, itemRows.map(cloneReturnItem));

    this.shipmentRepo.transitionTo(shipment.id, 'RETURN_PENDING');
    return cloneReturn(order);
  }

  async accept(
    id: string,
    processedBy: string,
    note: string | null,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);
    if (!order.shipmentId) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    const shipment = await this.shipmentRepo.findById(order.shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');

    const returnItems = (this.items.get(id) ?? []).map(cloneReturnItem);
    const shipmentItems = await this.shipmentRepo.listItems(shipment.id);
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
      (si) => si.itemId !== null && (returnedByShipmentItem.get(si.id) ?? 0) >= Number(si.expectedQty),
    );

    let shipmentStatus: 'RETURNED' | 'INBOUNDED';
    if (fullReturn) {
      shipmentStatus = 'RETURNED';
    } else {
      await this.inboundRepo.confirmReceiptRemainder(
        shipment.id,
        (si) => {
          const returned = returnedByShipmentItem.get(si.id) ?? 0;
          const remaining = Number(si.expectedQty) - returned;
          return remaining > 0 ? remaining.toFixed(2) : null;
        },
        processedBy,
      );
      shipmentStatus = 'INBOUNDED';
    }

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'CLOSED',
      processedBy,
      processedAt: now,
      processedNote: normalizeEmpty(note),
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    this.shipmentRepo.transitionTo(shipment.id, shipmentStatus);
    return cloneReturn(next);
  }

  async reject(id: string, processedBy: string, note: string): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'REJECTED',
      processedBy,
      processedAt: now,
      processedNote: note,
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    if (order.shipmentId) {
      this.shipmentRepo.transitionTo(order.shipmentId, 'READY');
    }
    return cloneReturn(next);
  }

  // ── 零售售后退货（source_type=SALES）────────────────────────────────
  async createFromSales(input: CreateSalesReturnRepoInput): Promise<ReturnOrderRecord> {
    const order = await this.salesRepo.findById(input.salesOrderId);
    if (!order) throw new Error('SALES_NOT_FOUND: sales order does not exist');
    if (
      order.status !== 'SENT' &&
      order.status !== 'PAYMENT_UPLOADED' &&
      order.status !== 'CONFIRMED'
    ) {
      throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    }

    const lines = await this.salesRepo.listItems(order.id);
    const byId = new Map(lines.map((l) => [l.id, l]));
    const returnedByLine = new Map<string, number>();
    for (const [returnId, itemRows] of this.items) {
      const ro = this.rows.get(returnId);
      if (!ro || ro.sourceType !== 'SALES' || ro.status === 'CANCELLED') continue;
      for (const ri of itemRows) {
        if (!ri.salesOrderItemId) continue;
        returnedByLine.set(
          ri.salesOrderItemId,
          (returnedByLine.get(ri.salesOrderItemId) ?? 0) + Number(ri.qty),
        );
      }
    }

    // 行级合并（同一销售行允许多行，汇总后校验）。
    const requested = new Map<string, { qty: number; reason: string | null }>();
    for (const l of input.lines) {
      const item = byId.get(l.salesOrderItemId);
      if (!item) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const qty = Number(l.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const prev = requested.get(item.id) ?? { qty: 0, reason: null };
      requested.set(item.id, {
        qty: round2(prev.qty + qty),
        reason: normalizeEmpty(l.reason) ?? prev.reason,
      });
    }
    if (requested.size === 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);
    const finalLines: { salesOrderItemId: string; itemId: string; qty: string; reason: string | null }[] = [];
    for (const [lineId, req] of requested) {
      const item = byId.get(lineId)!;
      const returnable = round2(Number(item.qty) - (returnedByLine.get(lineId) ?? 0));
      if (req.qty > returnable + 1e-9) throw new Error(RETURN_QTY_EXCEEDED_MESSAGE);
      finalLines.push({
        salesOrderItemId: item.id,
        itemId: item.itemId,
        qty: req.qty.toFixed(2),
        reason: req.reason,
      });
    }

    const now = new Date();
    const record: ReturnOrderRecord = {
      id: uuid(),
      returnNo: this.nextReturnNo(),
      sourceType: 'SALES',
      shipmentId: null,
      salesOrderId: order.id,
      fromUnitId: order.buyerUnitId,
      toUnitId: order.sellerUnitId,
      status: 'REQUESTED',
      reason: normalizeEmpty(input.reason),
      note: normalizeEmpty(input.note),
      photoFileIds: [...input.photoFileIds],
      returnCarrier: null,
      returnTrackingNo: null,
      createdBy: input.createdBy,
      processedBy: null,
      processedAt: null,
      processedNote: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, cloneReturn(record));
    this.items.set(
      record.id,
      finalLines.map<ReturnOrderItemRecord>((line) => ({
        id: uuid(),
        returnOrderId: record.id,
        itemId: line.itemId,
        shipmentItemId: null,
        salesOrderItemId: line.salesOrderItemId,
        qty: line.qty,
        receivedQty: null,
        originalBatchId: null,
        reason: line.reason,
        createdAt: now,
      })),
    );
    return cloneReturn(record);
  }

  async approveSales(
    id: string,
    processedBy: string,
    note: string | null,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    if (order.status !== 'REQUESTED') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'APPROVED',
      processedBy,
      processedAt: now,
      processedNote: normalizeEmpty(note),
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    return cloneReturn(next);
  }

  async rejectSales(
    id: string,
    processedBy: string,
    note: string,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    if (order.status !== 'REQUESTED') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'CANCELLED',
      processedBy,
      processedAt: now,
      processedNote: note,
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    return cloneReturn(next);
  }

  async receive(
    id: string,
    receivedBy: string,
    lines: SalesReturnReceiveLineInput[],
    note: string | null,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    if (order.status !== 'APPROVED') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);
    const salesOrder = order.salesOrderId ? await this.salesRepo.findById(order.salesOrderId) : null;
    if (!salesOrder) throw new Error('SALES_NOT_FOUND: sales order does not exist');

    const returnItems = (this.items.get(id) ?? []).map(cloneReturnItem);
    const byId = new Map(returnItems.map((i) => [i.id, i]));

    // 校验：每行实收数量 0 ≤ receivedQty ≤ 申请数量；所有退货行必须录入。
    const receivedByItem = new Map<string, number>();
    for (const line of lines) {
      const item = byId.get(line.returnItemId);
      if (!item) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const rqty = Number(line.receivedQty);
      if (!Number.isFinite(rqty) || rqty < 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      if (rqty > Number(item.qty) + 1e-9) throw new Error(RETURN_QTY_EXCEEDED_MESSAGE);
      receivedByItem.set(item.id, round2((receivedByItem.get(item.id) ?? 0) + rqty));
    }
    if (receivedByItem.size !== returnItems.length) throw new Error(RETURN_LINE_INVALID_MESSAGE);
    for (const [itemId, total] of receivedByItem) {
      const item = byId.get(itemId)!;
      if (total > Number(item.qty) + 1e-9) throw new Error(RETURN_QTY_EXCEEDED_MESSAGE);
    }

    // 原批次 unit_cost 快照（取该销售单 OUTBOUND_SALE 流水，按批次取最新一条）。
    const unitCostByBatch = new Map<string, number>();
    for (const m of this.ledger.movements) {
      if (
        m.orderType === 'sales' &&
        m.orderId === salesOrder.id &&
        m.type === 'OUTBOUND_SALE' &&
        !unitCostByBatch.has(m.batchId)
      ) {
        unitCostByBatch.set(m.batchId, m.unitCost);
      }
    }

    // 按销售行分配记录确定原批次（按分配顺序依次回补，量不足则转待检批次）。
    const allocations = await this.salesRepo.listAllocations(salesOrder.id);
    const allocByItem = new Map<string, { batchId: string; qty: number }[]>();
    for (const a of allocations) {
      const list = allocByItem.get(a.orderItemId) ?? [];
      list.push({ batchId: a.batchId, qty: Number(a.qty) });
      allocByItem.set(a.orderItemId, list);
    }

    const ensurePendingBatch = (itemId: string): string => {
      const existing = [...this.ledger.batches.values()].find(
        (b) =>
          b.itemId === itemId &&
          b.sourceType === 'RETURNS_PENDING' &&
          b.productionDate === null &&
          b.expiryDate === null,
      );
      if (existing) return existing.id;
      const batchId = uuid();
      this.ledger.batches.set(batchId, {
        id: batchId,
        itemId,
        batchNo: ensureBatchNo(itemId, null),
        productionDate: null,
        expiryDate: null,
        sourceType: 'RETURNS_PENDING',
        sourceOrderId: order.id,
        createdBy: receivedBy,
      });
      return batchId;
    };

    const replenish = (itemId: string, batchId: string, rqty: number, unitCost: number) => {
      const key = this.ledger.stockKey(salesOrder.sellerUnitId, itemId, batchId);
      const before = this.ledger.stock.get(key);
      const qtyBefore = before ? before.qty : 0;
      const qtyAfter = round2(qtyBefore + rqty);
      this.ledger.stock.set(key, {
        unitId: salesOrder.sellerUnitId,
        itemId,
        batchId,
        qty: qtyAfter,
        avgCost: before ? before.avgCost : unitCost,
        version: (before ? before.version : 0) + 1,
        updatedAt: new Date(),
      });
      this.ledger.movements.push({
        unitId: salesOrder.sellerUnitId,
        itemId,
        batchId,
        type: 'RETURN_IN',
        qtyDelta: round2(rqty),
        qtyBefore: round2(qtyBefore),
        qtyAfter,
        unitCost,
        orderType: 'sales',
        orderId: salesOrder.id,
        refNo: order.returnNo,
        operatorId: receivedBy,
        createdAt: new Date(),
      });
    };

    const now = new Date();
    const nextItems = (this.items.get(id) ?? []).map(cloneReturnItem);
    for (const item of nextItems) {
      const rqty = receivedByItem.get(item.id) ?? 0;
      if (rqty <= 0) continue;
      let remaining = rqty;
      const allocs = item.salesOrderItemId ? (allocByItem.get(item.salesOrderItemId) ?? []) : [];
      const targets: { batchId: string; qty: number; unitCost: number }[] = [];
      for (const alloc of allocs) {
        if (remaining <= 0) break;
        const take = Math.min(alloc.qty, remaining);
        targets.push({
          batchId: alloc.batchId,
          qty: take,
          unitCost: unitCostByBatch.get(alloc.batchId) ?? 0,
        });
        remaining = round2(remaining - take);
      }
      if (remaining > 0) {
        targets.push({ batchId: ensurePendingBatch(item.itemId), qty: remaining, unitCost: 0 });
      }
      for (const target of targets) {
        replenish(item.itemId, target.batchId, target.qty, target.unitCost);
      }
      item.receivedQty = rqty.toFixed(2);
      item.originalBatchId = targets[0]?.batchId ?? null;
    }
    this.items.set(id, nextItems);

    const next: ReturnOrderRecord = {
      ...order,
      status: 'RETURNED',
      processedBy: receivedBy,
      processedAt: now,
      processedNote: normalizeEmpty(note),
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    return cloneReturn(next);
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  referencesUnit(unitId: string): boolean {
    for (const row of this.rows.values()) {
      if (row.fromUnitId === unitId || row.toUnitId === unitId) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const order = this.rows.get(id);
    if (!order) return false;
    if (order.status !== 'PENDING' && order.status !== 'REQUESTED') {
      throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    }
    // SHIPMENT 来源且 PENDING：回退关联发货单 RETURN_PENDING → READY。
    if (order.sourceType === 'SHIPMENT' && order.status === 'PENDING' && order.shipmentId) {
      const shipment = await this.shipmentRepo.findById(order.shipmentId);
      if (shipment && shipment.status === 'RETURN_PENDING') {
        this.shipmentRepo.transitionTo(order.shipmentId, 'READY');
      }
    }
    this.items.delete(id);
    return this.rows.delete(id);
  }
}

// ── 内存实现：手动出入库 + 库存台账。 ──────────────────────────────────
