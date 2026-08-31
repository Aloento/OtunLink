import type {
  CreateUnitInput,
  CreateUserInput,
  Repos,
  UnitRecord,
  UnitRepository,
  UpdateUnitInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../types';

// 内存实现：供单元测试/本地无 DB 联调使用；生产必须走 Drizzle（见 repos/sql.ts 注释）。

const uuid = () => crypto.randomUUID();

class MemoryUserRepository implements UserRepository {
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
}

class MemoryUnitRepository implements UnitRepository {
  private rows = new Map<string, UnitRecord>();

  constructor(seed: UnitRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneUnit(row));
  }

  async findById(id: string): Promise<UnitRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneUnit(row) : null;
  }

  async list(opts: { includeInactive?: boolean; scopeUnitId?: string } = {}): Promise<UnitRecord[]> {
    return [...this.rows.values()]
      .filter((row) => (opts.includeInactive ? true : row.isActive))
      .filter((row) => (opts.scopeUnitId ? row.id === opts.scopeUnitId : true))
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
      timezone: input.timezone ?? 'UTC',
      baseCurrency: input.baseCurrency ?? 'CNY',
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
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.baseCurrency !== undefined ? { baseCurrency: patch.baseCurrency } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneUnit(next));
    return cloneUnit(next);
  }
}

function cloneUser(row: UserRecord): UserRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneUnit(row: UnitRecord): UnitRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function createMemoryRepos(seed?: { users?: UserRecord[]; units?: UnitRecord[] }): Repos {
  return {
    users: new MemoryUserRepository(seed?.users),
    units: new MemoryUnitRepository(seed?.units),
  };
}
