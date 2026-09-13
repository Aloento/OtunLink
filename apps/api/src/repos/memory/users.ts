// 用户内存仓库（users）。
import type { CreateUserInput, UpdateUserInput, UserRecord, UserRepository } from '../../types';
import { assertNotLockedAdmin, isPermanentAdminEmail } from '../../lib/admins';
import { uuid } from './helpers';

export class MemoryUserRepository implements UserRepository {
  private rows = new Map<string, UserRecord>();

  constructor(seed: UserRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneUser(row));
  }

  async findByEntraSub(sub: string): Promise<UserRecord | null> {
    for (const row of this.rows.values()) {
      if (row.entraSub === sub) return cloneUser(row);
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneUser(row) : null;
  }

  async list(): Promise<UserRecord[]> {
    return [...this.rows.values()].map(cloneUser);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    if (await this.findByEntraSub(input.entraSub)) {
      throw new Error('用户已存在（entra_sub 冲突）');
    }
    const now = new Date();
    const row: UserRecord = {
      id: uuid(),
      entraSub: input.entraSub,
      email: input.email,
      name: input.name,
      role: input.role ?? null,
      scopeUnitId: input.scopeUnitId ?? null,
      status: input.status ?? 'PENDING',
      locale: input.locale ?? 'zh-CN',
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, cloneUser(row));
    return cloneUser(row);
  }

  async update(id: string, patch: UpdateUserInput): Promise<UserRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (isPermanentAdminEmail(existing.email)) {
      assertNotLockedAdmin(existing);
    }
    const next: UserRecord = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.scopeUnitId !== undefined ? { scopeUnitId: patch.scopeUnitId } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneUser(next));
    return cloneUser(next);
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (existing && isPermanentAdminEmail(existing.email)) {
      assertNotLockedAdmin(existing);
    }
    return this.rows.delete(id);
  }

  referencesUnit(unitId: string): boolean {
    for (const row of this.rows.values()) {
      if (row.scopeUnitId === unitId) return true;
    }
    return false;
  }
}

function cloneUser(row: UserRecord): UserRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
