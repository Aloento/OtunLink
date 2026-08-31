import type { UnitType, UserRole, UserStatus } from '@otunlink/shared';

// 认证与数据层共享类型（ck-02）。
// Repository 接口是「生产 Drizzle / 测试内存实现」的接缝：生产最终应以
// drizzle-orm 查询构建替换本 checkpoint 的 SQL 实现，注入方式不变。

export interface JwksKv {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** Worker 运行时绑定与环境变量（本地 dev 来自 .dev.vars）。 */
export interface Env extends Record<string, unknown> {
  ENTRA_TENANT_ID?: string;
  ENTRA_CLIENT_ID?: string;
  ENTRA_AUDIENCE?: string;
  ENTRA_ISSUER?: string;
  JWKS_CACHE?: JwksKv;
  HYPERDRIVE?: unknown;
  DATABASE_URL?: string;
  ADMIN_SECRET?: string;
}

export interface TokenClaims {
  /** Entra v2.0 的 sub（工作账号通常等于 oid）。 */
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
}

export interface UserRecord {
  id: string;
  entraSub: string;
  email: string;
  name: string;
  role: UserRole | null;
  scopeUnitId: string | null;
  status: UserStatus;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UnitRecord {
  id: string;
  code: string;
  name: string;
  type: UnitType;
  address: string | null;
  contact: string | null;
  timezone: string;
  baseCurrency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  entraSub: string;
  email: string;
  name: string;
  role?: UserRole | null;
  scopeUnitId?: string | null;
  status?: UserStatus;
  locale?: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole | null;
  scopeUnitId?: string | null;
  status?: UserStatus;
  locale?: string;
}

export interface CreateUnitInput {
  code: string;
  name: string;
  type: UnitType;
  address?: string | null;
  contact?: string | null;
  timezone?: string;
  baseCurrency?: string;
  isActive?: boolean;
}

export interface UpdateUnitInput {
  code?: string;
  name?: string;
  type?: UnitType;
  address?: string | null;
  contact?: string | null;
  timezone?: string;
  baseCurrency?: string;
  isActive?: boolean;
}

export interface UserRepository {
  findByEntraSub(sub: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  list(): Promise<UserRecord[]>;
  create(input: CreateUserInput): Promise<UserRecord>;
  update(id: string, patch: UpdateUserInput): Promise<UserRecord | null>;
}

export interface UnitRepository {
  findById(id: string): Promise<UnitRecord | null>;
  list(opts?: { includeInactive?: boolean; scopeUnitId?: string }): Promise<UnitRecord[]>;
  create(input: CreateUnitInput): Promise<UnitRecord>;
  update(id: string, patch: UpdateUnitInput): Promise<UnitRecord | null>;
}

export interface Repos {
  users: UserRepository;
  units: UnitRepository;
}

export interface AuthState {
  claims: TokenClaims;
  user: UserRecord | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthState;
    repos: Repos | null;
  };
};
