// 签约内存仓库（retail_partnerships）。
import type { CreatePartnershipInput, CreatePartnershipResult, PartnershipListQuery, PartnershipRecord, PartnershipRepository } from '../../types';
import { uuid } from './helpers';
import type { MemoryUnitRepository } from './units';

// ── ck-??：仓库-零售签约（内存实现，与 SQL 实现语义一致）。 ────────────────────
export class MemoryPartnershipRepository implements PartnershipRepository {
  private rows = new Map<string, PartnershipRecord>();

  constructor(
    private readonly unitRepo: MemoryUnitRepository,
    seed: PartnershipRecord[] = [],
  ) {
    for (const row of seed) this.rows.set(row.id, { ...row });
  }

  private async hydrate(row: PartnershipRecord): Promise<PartnershipRecord> {
    const [warehouse, retailer] = await Promise.all([
      this.unitRepo.findById(row.warehouseUnitId),
      this.unitRepo.findById(row.retailerUnitId),
    ]);
    return {
      ...row,
      warehouseUnitName: warehouse?.name ?? row.warehouseUnitName ?? null,
      retailerUnitName: retailer?.name ?? row.retailerUnitName ?? null,
    };
  }

  async list(query: PartnershipListQuery = {}): Promise<PartnershipRecord[]> {
    const hydrated: PartnershipRecord[] = [];
    const rows = [...this.rows.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    for (const row of rows) {
      if (query.warehouseUnitId && row.warehouseUnitId !== query.warehouseUnitId) continue;
      if (query.retailerUnitId && row.retailerUnitId !== query.retailerUnitId) continue;
      hydrated.push(await this.hydrate(row));
    }
    return hydrated;
  }

  async listWarehouseIds(retailerUnitId: string): Promise<string[]> {
    return [...this.rows.values()]
      .filter((row) => row.retailerUnitId === retailerUnitId)
      .map((row) => row.warehouseUnitId);
  }

  async findById(id: string): Promise<PartnershipRecord | null> {
    const row = this.rows.get(id);
    return row ? this.hydrate(row) : null;
  }

  private async findByPair(
    warehouseUnitId: string,
    retailerUnitId: string,
  ): Promise<PartnershipRecord | null> {
    const row = [...this.rows.values()].find(
      (r) => r.warehouseUnitId === warehouseUnitId && r.retailerUnitId === retailerUnitId,
    );
    return row ? this.hydrate(row) : null;
  }

  async create(input: CreatePartnershipInput): Promise<CreatePartnershipResult> {
    const existing = await this.findByPair(input.warehouseUnitId, input.retailerUnitId);
    if (existing) return { record: existing, created: false };
    const row: PartnershipRecord = {
      id: uuid(),
      warehouseUnitId: input.warehouseUnitId,
      warehouseUnitName: null,
      retailerUnitId: input.retailerUnitId,
      retailerUnitName: null,
      createdBy: input.createdBy,
      createdAt: new Date(),
    };
    this.rows.set(row.id, { ...row });
    return { record: await this.hydrate(row), created: true };
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  referencesUnit(unitId: string): boolean {
    for (const row of this.rows.values()) {
      if (row.warehouseUnitId === unitId || row.retailerUnitId === unitId) return true;
    }
    return false;
  }
}
