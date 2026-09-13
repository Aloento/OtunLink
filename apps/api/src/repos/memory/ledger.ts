// 库存台账：批次、库存行与流水，供各单据实现共享。
import { INSUFFICIENT_STOCK_MESSAGE, STOCK_BATCH_NOT_FOUND_MESSAGE, round2 } from './helpers';

/** 供测试断言用的内存批次快照。 */
export interface MemoryBatchRecord {
  id: string;
  itemId: string;
  batchNo: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  sourceType: string;
  sourceOrderId: string | null;
  createdBy: string | null;
}

/** 供测试断言用的内存库存快照。 */
export interface MemoryStockRecord {
  unitId: string;
  itemId: string;
  batchId: string;
  qty: number;
  avgCost: number;
  version: number;
  updatedAt: Date;
}

/** 供测试断言用的内存台账快照。 */
export interface MemoryStockMovementRecord {
  unitId: string;
  itemId: string;
  batchId: string;
  type: string;
  qtyDelta: number;
  qtyBefore: number;
  qtyAfter: number;
  unitCost: number;
  orderType: string;
  orderId: string;
  refNo: string;
  operatorId: string | null;
  createdAt: Date;
}

/**
 * 共享内存台账：batches / stock / movements 三个 Map 供入库、
 * 出库、库存查询三个仓储共用，保证测试/联调时数据一致。
 */
export class MemoryStockLedger {
  readonly batches = new Map<string, MemoryBatchRecord>();
  readonly stock = new Map<string, MemoryStockRecord>();
  readonly movements: MemoryStockMovementRecord[] = [];

  stockKey(unitId: string, itemId: string, batchId: string): string {
    return `${unitId}|${itemId}|${batchId}`;
  }

  /** 入库：建档批次 + 库存（加权平均成本）+ 台账流水。 */
  applyInbound(params: {
    unitId: string;
    itemId: string;
    batch: MemoryBatchRecord;
    qty: number;
    unitCost: number;
    type: string;
    orderType: string;
    orderId: string;
    refNo: string;
    operatorId: string | null;
  }): void {
    const { unitId, itemId } = params;
    const now = new Date();
    this.batches.set(params.batch.id, { ...params.batch });
    const key = this.stockKey(unitId, itemId, params.batch.id);
    const before = this.stock.get(key);
    const qtyBefore = before ? before.qty : 0;
    const qtyAfter = qtyBefore + params.qty;
    const avgCost =
      qtyAfter > 0
        ? (qtyBefore * (before ? before.avgCost : 0) + params.qty * params.unitCost) / qtyAfter
        : 0;
    this.stock.set(key, {
      unitId,
      itemId,
      batchId: params.batch.id,
      qty: round2(qtyAfter),
      avgCost: round2(avgCost),
      version: (before ? before.version : 0) + 1,
      updatedAt: now,
    });
    this.movements.push({
      unitId,
      itemId,
      batchId: params.batch.id,
      type: params.type,
      qtyDelta: round2(params.qty),
      qtyBefore: round2(qtyBefore),
      qtyAfter: round2(qtyAfter),
      unitCost: params.unitCost,
      orderType: params.orderType,
      orderId: params.orderId,
      refNo: params.refNo,
      operatorId: params.operatorId,
      createdAt: now,
    });
  }

  /**
   * 出库扣减：batchId 缺省按 FEFO（到期日 → 生产日期升序）自动分配（可拆多批）；
   * 指定批次则须存在且数量足够。逐批写台账流水并返回分配明细。
   * 库存不足抛 INSUFFICIENT_STOCK；指定批次无库存抛 STOCK_BATCH_NOT_FOUND。
   */
  applyOutbound(params: {
    unitId: string;
    itemId: string;
    qty: number;
    batchId: string | null;
    type: string;
    orderType: string;
    orderId: string;
    refNo: string;
    operatorId: string | null;
  }): { batchId: string; qty: number; unitCost: number }[] {
    const keyOf = (batchId: string) => this.stockKey(params.unitId, params.itemId, batchId);
    const candidates = [...this.stock.values()]
      .filter((row) => row.unitId === params.unitId && row.itemId === params.itemId && row.qty > 0)
      .sort((a, b) => {
        const ea = this.batches.get(a.batchId)?.expiryDate ?? null;
        const eb = this.batches.get(b.batchId)?.expiryDate ?? null;
        if (ea !== eb) return (ea ?? '9999-12-31') < (eb ?? '9999-12-31') ? -1 : 1;
        const pa = this.batches.get(a.batchId)?.productionDate ?? null;
        const pb = this.batches.get(b.batchId)?.productionDate ?? null;
        if (pa !== pb) return (pa ?? '9999-12-31') < (pb ?? '9999-12-31') ? -1 : 1;
        return a.batchId < b.batchId ? -1 : a.batchId > b.batchId ? 1 : 0;
      });

    const now = new Date();
    const allocations: { batchId: string; qty: number; unitCost: number }[] = [];
    const consume = (row: MemoryStockRecord, qty: number) => {
      const qtyAfter = round2(row.qty - qty);
      if (qtyAfter < 0) throw new Error(INSUFFICIENT_STOCK_MESSAGE);
      this.stock.set(keyOf(row.batchId), {
        ...row,
        qty: qtyAfter,
        version: row.version + 1,
        updatedAt: now,
      });
      this.movements.push({
        unitId: params.unitId,
        itemId: params.itemId,
        batchId: row.batchId,
        type: params.type,
        qtyDelta: -round2(qty),
        qtyBefore: round2(row.qty),
        qtyAfter,
        unitCost: row.avgCost,
        orderType: params.orderType,
        orderId: params.orderId,
        refNo: params.refNo,
        operatorId: params.operatorId,
        createdAt: now,
      });
      allocations.push({ batchId: row.batchId, qty: round2(qty), unitCost: row.avgCost });
    };

    if (params.batchId) {
      const row = this.stock.get(keyOf(params.batchId));
      if (!row || row.qty < params.qty) {
        throw new Error(
          row && row.qty >= 0 ? INSUFFICIENT_STOCK_MESSAGE : STOCK_BATCH_NOT_FOUND_MESSAGE,
        );
      }
      consume(row, params.qty);
      return allocations;
    }

    const total = candidates.reduce((sum, row) => sum + row.qty, 0);
    if (round2(total) < params.qty) throw new Error(INSUFFICIENT_STOCK_MESSAGE);
    let remaining = params.qty;
    for (const row of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, row.qty);
      consume(row, take);
      remaining = round2(remaining - take);
    }
    return allocations;
  }
}
