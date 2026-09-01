import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { PartnershipRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const WAREHOUSE_UNIT_2 = '00000000-0000-4000-8000-000000000003';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000004';
const RETAIL_UNIT_2 = '00000000-0000-4000-8000-000000000005';

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
    code: `U-${partial.id.slice(-4)}`,
    name: '业务单元',
    type: 'COLLECTOR',
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

const warehouse = user({ entraSub: 'wh', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
const warehouse2 = user({ entraSub: 'wh2', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT_2 });
const retailer = user({ entraSub: 'rt', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });
const retailer2 = user({ entraSub: 'rt2', role: 'RETAILER', scopeUnitId: RETAIL_UNIT_2 });
const collector = user({ entraSub: 'collector', role: 'COLLECTOR' });
const admin = user({ entraSub: 'admin', role: 'ADMIN' });

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '仓库一' }),
  unit({ id: WAREHOUSE_UNIT_2, type: 'WAREHOUSE', name: '仓库二' }),
  unit({ id: RETAIL_UNIT, type: 'RETAILER', name: '零售门店一' }),
  unit({ id: RETAIL_UNIT_2, type: 'RETAILER', name: '零售门店二' }),
];

function makeApp(partnerships: PartnershipRecord[] = []) {
  const repos = createMemoryRepos({
    users: [warehouse, warehouse2, retailer, retailer2, collector, admin],
    units,
    partnerships,
  });
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

describe('仓库-零售签约（retail_partnerships）', () => {
  it('仓库添加/移除客户；重复添加幂等；零售查看已签约仓库；管理员全量', async () => {
    const { app } = makeApp();

    // 仓库把零售门店一加入可售客户。
    const added = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ retailerUnitId: RETAIL_UNIT }),
    });
    expect(added.status).toBe(201);
    const created = (await added.json()) as {
      data: { id: string; warehouseUnitId: string; retailerUnitId: string };
    };
    expect(created.data).toMatchObject({ warehouseUnitId: WAREHOUSE_UNIT, retailerUnitId: RETAIL_UNIT });

    // 重复添加 → 200（幂等）。
    const dup = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ retailerUnitId: RETAIL_UNIT }),
    });
    expect(dup.status).toBe(200);
    const dupBody = (await dup.json()) as { data: { id: string } };
    expect(dupBody.data.id).toBe(created.data.id);

    // 仓库查看自己的客户列表。
    const whList = await app.request('/api/v1/partnerships', { headers: auth('wh') });
    expect(whList.status).toBe(200);
    const whItems = ((await whList.json()) as {
      data: { items: Array<{ retailerUnitId: string }> };
    }).data.items;
    expect(whItems.map((i) => i.retailerUnitId)).toEqual([RETAIL_UNIT]);

    // 零售查看已签约仓库列表。
    const rtList = await app.request('/api/v1/partnerships', { headers: auth('rt') });
    expect(rtList.status).toBe(200);
    const rtItems = ((await rtList.json()) as {
      data: { items: Array<{ warehouseUnitId: string }> };
    }).data.items;
    expect(rtItems.map((i) => i.warehouseUnitId)).toEqual([WAREHOUSE_UNIT]);

    // 管理员全量（此刻 1 条）。
    const adminList = await app.request('/api/v1/partnerships', { headers: auth('admin') });
    const adminBody = (await adminList.json()) as { data: { items: unknown[] } };
    expect(adminBody.data.items).toHaveLength(1);

    // 移除。
    const removed = await app.request(`/api/v1/partnerships/${created.data.id}`, {
      method: 'DELETE',
      headers: auth('wh'),
    });
    expect(removed.status).toBe(200);
    const after = await app.request('/api/v1/partnerships', { headers: auth('wh') });
    expect(((await after.json()) as { data: { items: unknown[] } }).data.items).toHaveLength(0);
  });

  it('仓库不能操作他人仓库的客户；管理员可删除任意签约', async () => {
    const seed: PartnershipRecord = {
      id: '00000000-0000-4000-8000-0000000000a1',
      warehouseUnitId: WAREHOUSE_UNIT_2,
      warehouseUnitName: null,
      retailerUnitId: RETAIL_UNIT_2,
      retailerUnitName: null,
      createdBy: null,
      createdAt: now,
    };
    const { app } = makeApp([seed]);

    // 仓库一不能删除仓库二的签约。
    const forbiddenDel = await app.request(`/api/v1/partnerships/${seed.id}`, {
      method: 'DELETE',
      headers: auth('wh'),
    });
    expect(forbiddenDel.status).toBe(403);

    // 仓库一不能以仓库二名义添加客户（显式 warehouseUnitId 越界）。
    const forbiddenAdd = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ warehouseUnitId: WAREHOUSE_UNIT_2, retailerUnitId: RETAIL_UNIT }),
    });
    expect(forbiddenAdd.status).toBe(403);

    // 管理员可删除。
    const adminDel = await app.request(`/api/v1/partnerships/${seed.id}`, {
      method: 'DELETE',
      headers: auth('admin'),
    });
    expect(adminDel.status).toBe(200);
  });

  it('非 WAREHOUSE 不能创建签约；非 ADMIN 空 scope → 403；零售/集货方不能写', async () => {
    const { app } = makeApp();

    const rtPost = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('rt'),
      body: JSON.stringify({ retailerUnitId: RETAIL_UNIT }),
    });
    expect(rtPost.status).toBe(403);

    // 集货方无 scope：requireUnitScopeAssigned → 403（且角色也不允许）。
    const collectorGet = await app.request('/api/v1/partnerships', { headers: auth('collector') });
    expect(collectorGet.status).toBe(403);

    // ADMIN 空 scope 添加必须显式给 warehouseUnitId。
    const adminNoWh = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('admin'),
      body: JSON.stringify({ retailerUnitId: RETAIL_UNIT }),
    });
    expect(adminNoWh.status).toBe(400);

    const adminOk = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('admin'),
      body: JSON.stringify({ warehouseUnitId: WAREHOUSE_UNIT, retailerUnitId: RETAIL_UNIT_2 }),
    });
    expect(adminOk.status).toBe(201);
  });

  it('候选零售单元目录：WAREHOUSE 仅见 RETAILER 类型；RETAILER 不可见', async () => {
    const { app } = makeApp();

    const whCandidates = await app.request('/api/v1/partnerships/candidates', { headers: auth('wh') });
    expect(whCandidates.status).toBe(200);
    const whItems = ((await whCandidates.json()) as {
      data: { items: Array<{ id: string; type: string }> };
    }).data.items;
    expect(whItems.map((i) => i.type)).toEqual(['RETAILER', 'RETAILER']);
    expect(whItems.map((i) => i.id).sort()).toEqual([RETAIL_UNIT, RETAIL_UNIT_2].sort());

    // 零售角色不能访问候选目录（requireRole → 403）。
    const rtCandidates = await app.request('/api/v1/partnerships/candidates', { headers: auth('rt') });
    expect(rtCandidates.status).toBe(403);
  });

  it('校验：零售单元必须为 RETAILER 类型；仓库单元必须为 WAREHOUSE 类型', async () => {
    const { app } = makeApp();

    // retailer 为仓库单元 → 400。
    const badRetailer = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ retailerUnitId: WAREHOUSE_UNIT_2 }),
    });
    expect(badRetailer.status).toBe(400);

    // 管理员把 collector 单元当作仓库 → 400。
    const badWarehouse = await app.request('/api/v1/partnerships', {
      method: 'POST',
      headers: json('admin'),
      body: JSON.stringify({ warehouseUnitId: COLLECTOR_UNIT, retailerUnitId: RETAIL_UNIT }),
    });
    expect(badWarehouse.status).toBe(400);
  });
});
