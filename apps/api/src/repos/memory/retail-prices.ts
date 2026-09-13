// 零售价内存仓库（retail_prices + history）。
import type { RetailPriceHistoryRecord, RetailPriceListQuery, RetailPriceRecord, RetailPriceRepository } from '../../types';
import { resolveSpec } from '../item-spec';
import { round2, uuid } from './helpers';
import type { MemoryItemRepository } from './items';
import type { MemoryStockLedger } from './ledger';
import type { MemoryUnitRepository } from './units';
import type { MemoryUserRepository } from './users';

/** 内存零售价仓储：持有当前价 + 历史；unit_cost 只读（从台账加权平均计算）。 */
export class MemoryRetailPriceRepository implements RetailPriceRepository {
  private prices = new Map<string, RetailPriceRecord>();
  private history: RetailPriceHistoryRecord[] = [];

  constructor(
    private readonly ledger: MemoryStockLedger,
    private readonly unitRepo: MemoryUnitRepository,
    private readonly itemRepo: MemoryItemRepository,
    private readonly userRepo: MemoryUserRepository,
  ) {}

  private key(unitId: string, itemId: string): string {
    return `${unitId}|${itemId}`;
  }

  /** 入库加权平均进价（只读参考）：SUM(qty*avg_cost)/SUM(qty)，无库存为 null。 */
  private unitCostOf(unitId: string, itemId: string): string | null {
    const rows = [...this.ledger.stock.values()].filter(
      (row) => row.unitId === unitId && row.itemId === itemId && row.qty > 0,
    );
    const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
    if (totalQty <= 0) return null;
    const totalCost = rows.reduce((sum, row) => sum + row.qty * row.avgCost, 0);
    return round2(totalCost / totalQty).toFixed(2);
  }

  async list(query: RetailPriceListQuery): Promise<RetailPriceRecord[]> {
    const rows = [...this.prices.values()]
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .sort((a, b) =>
        `${a.unitName ?? ''}|${a.itemName ?? ''}|${a.itemId}`.localeCompare(
          `${b.unitName ?? ''}|${b.itemName ?? ''}|${b.itemId}`,
        ),
      );
    return rows.map((row) => ({ ...row, unitCost: this.unitCostOf(row.unitId, row.itemId) }));
  }

  async setPrice(input: {
    unitId: string;
    itemId: string;
    price: string;
    currency: string;
    updatedBy: string;
  }): Promise<RetailPriceRecord> {
    const [unit, item, user] = await Promise.all([
      this.unitRepo.findById(input.unitId),
      this.itemRepo.findById(input.itemId),
      this.userRepo.findById(input.updatedBy),
    ]);
    const now = new Date();
    const existing = this.prices.get(this.key(input.unitId, input.itemId));
    const record: RetailPriceRecord = {
      id: existing?.id ?? uuid(),
      unitId: input.unitId,
      unitName: unit?.name ?? null,
      itemId: input.itemId,
      itemName: item?.name ?? null,
      spec: resolveSpec(item),
      minSaleUnit: item?.minSaleUnit ?? null,
      price: input.price,
      currency: input.currency,
      unitCost: this.unitCostOf(input.unitId, input.itemId),
      updatedBy: input.updatedBy,
      updatedByName: user?.name ?? null,
      updatedAt: now,
    };
    this.prices.set(this.key(input.unitId, input.itemId), { ...record });
    this.history.push({
      id: uuid(),
      unitId: input.unitId,
      unitName: record.unitName,
      itemId: input.itemId,
      itemName: record.itemName,
      price: input.price,
      currency: input.currency,
      updatedBy: input.updatedBy,
      updatedByName: record.updatedByName,
      updatedAt: now,
    });
    return { ...record };
  }

  async listHistory(unitId: string, itemId: string): Promise<RetailPriceHistoryRecord[]> {
    return this.history
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.unitId === unitId && row.itemId === itemId)
      // 内存时间戳只有毫秒精度，同毫秒内的多次改价按写入先后兜底排序，
      // 保证列表顺序确定（生产用 now() 微秒精度，不会出现并列）。
      .sort((a, b) => b.row.updatedAt.getTime() - a.row.updatedAt.getTime() || b.index - a.index)
      .map(({ row }) => ({ ...row }));
  }

  referencesItem(itemId: string): boolean {
    for (const row of this.prices.values()) {
      if (row.itemId === itemId) return true;
    }
    return false;
  }

  referencesUnit(unitId: string): boolean {
    for (const row of this.prices.values()) {
      if (row.unitId === unitId) return true;
    }
    return false;
  }
}
