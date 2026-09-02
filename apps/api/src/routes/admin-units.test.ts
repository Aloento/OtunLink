import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ShipmentRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

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

function unit(partial: Partial<UnitRecord> & { id: string }): UnitRecord {
  return {
    code: `U-${partial.id}`,
    name: '测试单元',
    type: 'WAREHOUSE',
    address: null,
    contact: null,
    timezone: 'UTC',
    baseCurrency: 'CNY',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function shipment(partial: Partial<ShipmentRecord> & { id: string }): ShipmentRecord {
  return {
    shipmentNo: `SH-${partial.id}`,
    shipperUnitId: 'u-shipper',
    receiverUnitId: 'u-receiver',
    status: 'DRAFT',
    boxesCount: 1,
    currency: 'CNY',
    expectedArrivalDate: null,
    remark: null,
    sentAt: null,
    countVersion: 0,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function makeApp(seed: Parameters<typeof createMemoryRepos>[0] = {}) {
  const repos = createMemoryRepos(seed);
  const app = createApp({
    verifyToken: async (_env, token): Promise<TokenClaims> => ({ sub: token }),
    getRepos: async () => repos,
  });
  return { app, repos };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function json(token: string) {
  return { ...auth(token), 'Content-Type': 'application/json' };
}

const admin = user({ entraSub: 'admin', role: 'ADMIN' });

describe('admin units 业务单元管理 API', () => {
  it('未登录访问 /admin/units 返回 401', async () => {
    const { app } = makeApp({});
    const res = await app.request('/api/v1/admin/units');
    expect(res.status).toBe(401);
  });

  it('COLLECTOR 访问返回 403（无 UNITS_ADMIN）', async () => {
    const { app } = makeApp({ users: [user({ entraSub: 'collector', role: 'COLLECTOR' })] });
    const res = await app.request('/api/v1/admin/units', { headers: auth('collector') });
    expect(res.status).toBe(403);
  });

  it('PENDING 用户访问返回 403', async () => {
    const { app } = makeApp({ users: [user({ entraSub: 'pending', status: 'PENDING' })] });
    const res = await app.request('/api/v1/admin/units', { headers: auth('pending') });
    expect(res.status).toBe(403);
  });

  it('GET 列表包含启用与停用单元', async () => {
    const { app } = makeApp({
      users: [admin],
      units: [
        unit({ id: 'u1', name: '上海集货', type: 'COLLECTOR' }),
        unit({ id: 'u2', name: '北京仓', type: 'WAREHOUSE', isActive: false }),
      ],
    });
    const res = await app.request('/api/v1/admin/units', { headers: auth('admin') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
    expect(body.data.map((u) => u.id).sort()).toEqual(['u1', 'u2']);
  });

  it('POST 创建单元 201 并使用默认值', async () => {
    const { app } = makeApp({ users: [admin] });
    const res = await app.request('/api/v1/admin/units', {
      method: 'POST',
      headers: json('admin'),
      body: JSON.stringify({ code: 'U-SH', name: '上海集货', type: 'COLLECTOR' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { code: string; type: string; timezone: string; isActive: boolean };
    };
    expect(body.data.code).toBe('U-SH');
    expect(body.data.type).toBe('COLLECTOR');
    expect(body.data.timezone).toBe('UTC');
    expect(body.data.isActive).toBe(true);
  });

  it('POST 参数不合法返回 400', async () => {
    const { app } = makeApp({ users: [admin] });
    const res = await app.request('/api/v1/admin/units', {
      method: 'POST',
      headers: json('admin'),
      body: JSON.stringify({ code: '', name: 'x', type: 'UNKNOWN' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('PATCH 更新单元 200，不存在返回 404', async () => {
    const { app } = makeApp({ users: [admin], units: [unit({ id: 'u1', name: '旧名' })] });
    const okRes = await app.request('/api/v1/admin/units/u1', {
      method: 'PATCH',
      headers: json('admin'),
      body: JSON.stringify({ name: '新名', isActive: false }),
    });
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toMatchObject({ data: { id: 'u1', name: '新名', isActive: false } });

    const miss = await app.request('/api/v1/admin/units/missing', {
      method: 'PATCH',
      headers: json('admin'),
      body: JSON.stringify({ name: 'x' }),
    });
    expect(miss.status).toBe(404);
  });

  // ── 单元删除 ──────────────────────────────────────────────────────

  it('无引用时 DELETE 成功，随后 GET 返回 404', async () => {
    const { app } = makeApp({ users: [admin], units: [unit({ id: 'u1' })] });
    const del = await app.request('/api/v1/admin/units/u1', {
      method: 'DELETE',
      headers: auth('admin'),
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ data: { id: 'u1' } });

    const get = await app.request('/api/v1/admin/units/u1', { headers: auth('admin') });
    expect(get.status).toBe(404);
  });

  it('被发货单引用时 DELETE 返回 409 UNIT_IN_USE', async () => {
    const { app } = makeApp({
      users: [admin],
      units: [unit({ id: 'u1' })],
      shipments: [shipment({ id: 's1', shipperUnitId: 'u1', receiverUnitId: 'u-r' })],
    });
    const res = await app.request('/api/v1/admin/units/u1', {
      method: 'DELETE',
      headers: auth('admin'),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'UNIT_IN_USE' } });
  });

  it('被用户 scope_unit_id 引用时 DELETE 返回 409 UNIT_IN_USE', async () => {
    const { app } = makeApp({
      users: [
        admin,
        user({ entraSub: 'operator', role: 'WAREHOUSE', scopeUnitId: 'u1' }),
      ],
      units: [unit({ id: 'u1' })],
    });
    const res = await app.request('/api/v1/admin/units/u1', {
      method: 'DELETE',
      headers: auth('admin'),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'UNIT_IN_USE' } });
  });

  it('DELETE 不存在的单元返回 404', async () => {
    const { app } = makeApp({ users: [admin] });
    const res = await app.request('/api/v1/admin/units/missing', {
      method: 'DELETE',
      headers: auth('admin'),
    });
    expect(res.status).toBe(404);
  });
});
