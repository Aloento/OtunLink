// 组织单元内存仓库（units）。
import type { UnitType } from '@otunlink/shared';
import type { CreateUnitInput, UnitRecord, UnitRepository, UpdateUnitInput } from '../../types';
import { uuid } from './helpers';

export class MemoryUnitRepository implements UnitRepository {
  private rows = new Map<string, UnitRecord>();

  constructor(seed: UnitRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneUnit(row));
  }

  async findById(id: string): Promise<UnitRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneUnit(row) : null;
  }

  async list(
    opts: { includeInactive?: boolean; scopeUnitId?: string; type?: UnitType } = {},
  ): Promise<UnitRecord[]> {
    return [...this.rows.values()]
      .filter((row) => (opts.includeInactive ? true : row.isActive))
      .filter((row) => (opts.scopeUnitId ? row.id === opts.scopeUnitId : true))
      .filter((row) => (opts.type ? row.type === opts.type : true))
      .map(cloneUnit);
  }

  async create(input: CreateUnitInput): Promise<UnitRecord> {
    const now = new Date();
    const row: UnitRecord = {
      id: uuid(),
      code: input.code,
      name: input.name,
      type: input.type,
      address: input.address ?? null,
      contact: input.contact ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, cloneUnit(row));
    return cloneUnit(row);
  }

  async update(id: string, patch: UpdateUnitInput): Promise<UnitRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const next: UnitRecord = {
      ...existing,
      ...(patch.code !== undefined ? { code: patch.code } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.contact !== undefined ? { contact: patch.contact } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneUnit(next));
    return cloneUnit(next);
  }

  private referenceCheckers: ((unitId: string) => boolean)[] = [];

  addReferenceChecker(checker: (unitId: string) => boolean): void {
    this.referenceCheckers.push(checker);
  }

  async hasReferences(unitId: string): Promise<boolean> {
    if (!this.rows.has(unitId)) return false;
    return this.referenceCheckers.some((checker) => checker(unitId));
  }

  async delete(unitId: string): Promise<boolean> {
    return this.rows.delete(unitId);
  }
}

function cloneUnit(row: UnitRecord): UnitRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
