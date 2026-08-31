import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { TokenClaims, UnitRecord, UserRecord } from '../types';

// 端到端鉴权测试（无真实 DB / Entra）：注入 fake verifyToken + 内存仓库。
// fake token 即 entra_sub，便于直接断言「token → user」流程。

const now = new Date('2025-01-01T00:00:00.000Z');

function user(partial: Partial<UserRecord> & { entraSub: string }): UserRecord {
  return {
    id: partial.id ?? `id-${partial.entraSub}`,
    entraSub: partial.entraSub,
    email: partial.email ?? `${partial.entraSub}@test.local`,
    name: partial.name ?? partial.entraSub,
    role: partial.role ?? null,
    scopeUnitId: partial.scopeUnitId ?? null,
    status: partial.status ?? 'ACTIVE',
    locale: partial.locale ?? 'zh-CN',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function unit(partial: Partial<UnitRecord> & { id: string; code: string }): UnitRecord {
  return {
    id: partial.id,
    code: partial.code,
    name: partial.name ?? partial.code,
    type: partial.type ?? 'WAREHOUSE',
    address: partial.address ?? null,
    contact: partial.contact ?? null,
    timezone: partial.timezone ?? 'UTC',
    baseCurrency: partial.baseCurrency ?? 'CNY',
    isActive: partial.isActive ?? true,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function makeApp(seed: { users?: UserRecord[]; units?: UnitRecord[] }) {
  const repos = createMemoryRepos(seed);
  const app = createApp({
    verifyToken: async (_env, token): Promise<TokenClaims> => ({
      sub: token,
      email: `${token}@test.local`,
      name: token,
    }),
    getRepos: async () => repos,
  });
  return { app, repos };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('auth / RBAC（ck-02 抽样）', () => {
  it('无 token 访问受保护路由返回 401', async () => {
    const { app } = makeApp({});
    const res = await app.request('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('非法 token 返回 401', async () => {
    const { app } = makeApp({});
    const verifyReject = createApp({
      verifyToken: async () => {
        throw new Error('bad signature');
      },
      getRepos: async () => null,
    });
    const res = await verifyReject.request('/api/v1/auth/me', { headers: auth('x') });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('/auth/me 对未知 sub 自动开户为 PENDING', async () => {
    const { app } = makeApp({});
    const res = await app.request('/api/v1/auth/me', { headers: auth('newbie') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: UserRecord & { createdAt: string } };
    expect(body.data.status).toBe('PENDING');
    expect(body.data.role).toBeNull();
  });

  it('PENDING 用户可访问 /auth/me，访问业务路由返回 403', async () => {
    const { app } = makeApp({
      users: [user({ entraSub: 'pending', status: 'PENDING' })],
    });
    const me = await app.request('/api/v1/auth/me', { headers: auth('pending') });
    expect(me.status).toBe(200);

    const usersMe = await app.request('/api/v1/users/me', { headers: auth('pending') });
    expect(usersMe.status).toBe(403);

    const units = await app.request('/api/v1/units', { headers: auth('pending') });
    expect(units.status).toBe(403);
  });

  it('非管理员访问管理端用户返回 403', async () => {
    const { app } = makeApp({
      users: [user({ entraSub: 'collector', role: 'COLLECTOR' })],
    });
    const res = await app.request('/api/v1/admin/users', { headers: auth('collector') });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('管理员可列出用户', async () => {
    const { app } = makeApp({
      users: [
        user({ entraSub: 'admin', role: 'ADMIN' }),
        user({ entraSub: 'collector', role: 'COLLECTOR' }),
      ],
    });
    const res = await app.request('/api/v1/admin/users', { headers: auth('admin') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(2);
    // DTO 不应暴露 entraSub
    expect(JSON.stringify(body.data)).not.toContain('entraSub');
  });

  it('管理员可创建用户并分配岗位/数据范围', async () => {
    const { app } = makeApp({ users: [user({ entraSub: 'admin', role: 'ADMIN' })] });
    const res = await app.request('/api/v1/admin/users', {
      method: 'POST',
      headers: { ...auth('admin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entraSub: 'new-collector',
        email: 'nc@test.local',
        name: 'New Collector',
        role: 'COLLECTOR',
        scopeUnitId: '00000000-0000-4000-8000-000000000001',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { role: string; scopeUnitId: string; status: string } };
    expect(body.data.role).toBe('COLLECTOR');
    expect(body.data.scopeUnitId).toBe('00000000-0000-4000-8000-000000000001');
    expect(body.data.status).toBe('PENDING');
  });

  it('管理员可修改用户岗位（立即生效于重新鉴权）', async () => {
    const { app } = makeApp({
      users: [user({ entraSub: 'admin', role: 'ADMIN' }), user({ entraSub: 'u1', role: 'RETAILER' })],
    });
    const patch = await app.request('/api/v1/admin/users/id-u1', {
      method: 'PATCH',
      headers: { ...auth('admin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'WAREHOUSE', status: 'ACTIVE' }),
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { data: { role: string; status: string } };
    expect(body.data.role).toBe('WAREHOUSE');
    expect(body.data.status).toBe('ACTIVE');

    // 重新鉴权：u1 现在应能访问 units（WAREHOUSE 具备 units:read）
    const units = await app.request('/api/v1/units', { headers: auth('u1') });
    expect(units.status).toBe(200);
  });

  it('管理员可删除用户', async () => {
    const { app } = makeApp({
      users: [user({ entraSub: 'admin', role: 'ADMIN' }), user({ id: 'id-u2', entraSub: 'u2' })],
    });
    const del = await app.request('/api/v1/admin/users/id-u2', {
      method: 'DELETE',
      headers: auth('admin'),
    });
    expect(del.status).toBe(200);
    const list = await app.request('/api/v1/admin/users', { headers: auth('admin') });
    const body = (await list.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('管理员不能删除当前登录账号', async () => {
    const { app } = makeApp({ users: [user({ id: 'id-admin', entraSub: 'admin', role: 'ADMIN' })] });
    const del = await app.request('/api/v1/admin/users/id-admin', {
      method: 'DELETE',
      headers: auth('admin'),
    });
    expect(del.status).toBe(400);
  });

  it('按 oid 关联：用户 entraSub=oid 时，sub 鉴权也能命中该记录', async () => {
    const repos = createMemoryRepos({
      users: [user({ id: 'id-w', entraSub: 'oid-123', role: 'COLLECTOR', status: 'ACTIVE' })],
    });
    const app = createApp({
      verifyToken: async () => ({
        sub: 'sub-xyz',
        oid: 'oid-123',
        email: 'w@test.local',
        name: 'w',
      }),
      getRepos: async () => repos,
    });
    const res = await app.request('/api/v1/auth/me', { headers: auth('sub-xyz') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id).toBe('id-w');
  });

  it('管理员可创建/更新业务单元', async () => {
    const { app } = makeApp({ users: [user({ entraSub: 'admin', role: 'ADMIN' })] });
    const create = await app.request('/api/v1/admin/units', {
      method: 'POST',
      headers: { ...auth('admin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'WH-HU', name: '匈牙利仓库', type: 'WAREHOUSE' }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { data: { id: string } };

    const patch = await app.request(`/api/v1/admin/units/${created.data.id}`, {
      method: 'PATCH',
      headers: { ...auth('admin'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    expect(patch.status).toBe(200);
    const updated = (await patch.json()) as { data: { isActive: boolean } };
    expect(updated.data.isActive).toBe(false);
  });

  it('数据范围：scope_unit_id 非空时 /units 仅返回该单元', async () => {
    const unitA = unit({ id: 'ua', code: 'SH-CN', name: '上海集货部' });
    const unitB = unit({ id: 'ub', code: 'WH-HU', name: '匈牙利仓库' });
    const { app } = makeApp({
      users: [user({ entraSub: 'wh', role: 'WAREHOUSE', scopeUnitId: 'ua' })],
      units: [unitA, unitB],
    });
    const res = await app.request('/api/v1/units', { headers: auth('wh') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    expect(body.data.map((u) => u.id)).toEqual(['ua']);
  });

  it('无 DB 时受保护路由返回 503（区别于未开户 403）', async () => {
    const app = createApp({
      verifyToken: async (_env, token): Promise<TokenClaims> => ({ sub: token }),
      getRepos: async () => null,
    });
    const res = await app.request('/api/v1/auth/me', { headers: auth('any') });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
  });
});
