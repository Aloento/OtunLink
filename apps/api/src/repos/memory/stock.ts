// 库存内存仓库（stock + stock_movements）。
import { expiryRemainingDays } from '@otunlink/shared';
import type { StockBatchListQuery, StockBatchRecord, StockListQuery, StockListResult, StockMovementListQuery, StockMovementListResult, StockMovementRecord, StockRepository, StockRowRecord } from '../../types';
import type { MemoryItemRepository } from './items';
import type { MemoryStockLedger, MemoryStockRecord } from './ledger';
import type { MemoryUnitRepository } from './units';

export class MemoryStockRepository implements StockRepository {
  constructor(
    private readonly ledger: MemoryStockLedger,
    private readonly unitRepo: MemoryUnitRepository,
    private readonly itemRepo: MemoryItemRepository,
  ) {}

  private async hydrate(row: MemoryStockRecord): Promise<StockRowRecord> {
    const [unit, item, batch] = await Promise.all([
      this.unitRepo.findById(row.unitId),
      this.itemRepo.findById(row.itemId),
      Promise.resolve(this.ledger.batches.get(row.batchId) ?? null),
    ]);
    return {
      unitId: row.unitId,
      unitName: unit?.name ?? null,
      itemId: row.itemId,
      itemName: item?.name ?? null,
      spec: item ? (item.minSaleUnit === 'INNER' ? item.innerUnit : item.specUnit) : null,
      minSaleUnit: item?.minSaleUnit ?? null,
      batchId: row.batchId,
      batchNo: batch?.batchNo ?? null,
      productionDate: batch?.productionDate ?? null,
      expiryDate: batch?.expiryDate ?? null,
      qty: String(row.qty),
      avgCost: String(row.avgCost),
      version: row.version,
      updatedAt: row.updatedAt,
    };
  }

  private async hydrateBatches(rows: MemoryStockRecord[]): Promise<StockBatchRecord[]> {
    const items: StockBatchRecord[] = [];
    for (const row of rows) {
      const base = await this.hydrate(row);
      const remainingDays = expiryRemainingDays(base.expiryDate, new Date());
      items.push({ ...base, remainingDays, isExpired: remainingDays !== null && remainingDays < 0 });
    }
    return items;
  }

  async list(query: StockListQuery): Promise<StockListResult> {
    const rows = [...this.ledger.stock.values()]
      .filter((row) => row.qty > 0)
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .filter((row) => (query.batchId ? row.batchId === query.batchId : true))
      .sort((a, b) =>
        `${a.unitId}|${a.itemId}|${a.batchId}`.localeCompare(`${b.unitId}|${b.itemId}|${b.batchId}`),
      );
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    const items: StockRowRecord[] = [];
    for (const row of rows.slice(start, start + size)) {
      items.push(await this.hydrate(row));
    }
    return { items, total: rows.length, page, size };
  }

  async listBatches(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
    const rows = [...this.ledger.stock.values()]
      .filter((row) => row.qty > 0)
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .sort((a, b) => {
        const ea = this.ledger.batches.get(a.batchId)?.expiryDate ?? '9999-12-31';
        const eb = this.ledger.batches.get(b.batchId)?.expiryDate ?? '9999-12-31';
        return ea.localeCompare(eb) || `${a.unitId}|${a.itemId}`.localeCompare(`${b.unitId}|${b.itemId}`);
      });
    return this.hydrateBatches(rows);
  }

  async listExpired(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
    const all = await this.listBatches(query);
    return all.filter((row) => row.isExpired);
  }

  async listMovements(query: StockMovementListQuery): Promise<StockMovementListResult> {
    const filtered = this.ledger.movements
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .filter((row) => (query.batchId ? row.batchId === query.batchId : true))
      .reverse();
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    const items: StockMovementRecord[] = [];
    for (const row of filtered.slice(start, start + size)) {
      const [unit, item, batch] = await Promise.all([
        this.unitRepo.findById(row.unitId),
        this.itemRepo.findById(row.itemId),
        Promise.resolve(this.ledger.batches.get(row.batchId) ?? null),
      ]);
      items.push({
        id: `${row.orderType}:${row.orderId}:${row.batchId}:${row.operatorId ?? ''}:${row.createdAt.getTime()}`,
        unitId: row.unitId,
        unitName: unit?.name ?? null,
        itemId: row.itemId,
        itemName: item?.name ?? null,
        spec: item ? (item.minSaleUnit === 'INNER' ? item.innerUnit : item.specUnit) : null,
        batchId: row.batchId,
        batchNo: batch?.batchNo ?? null,
        type: row.type as StockMovementRecord['type'],
        qtyDelta: String(row.qtyDelta),
        qtyBefore: String(row.qtyBefore),
        qtyAfter: String(row.qtyAfter),
        unitCost: String(row.unitCost),
        orderType: row.orderType,
        orderId: row.orderId,
        refNo: row.refNo,
        note: null,
        operatorId: row.operatorId,
        createdAt: row.createdAt,
      });
    }
    return { items, total: filtered.length, page, size };
  }
}

// ── 内存实现：零售价 + 站内通知。 ──────────────────────────────────────
