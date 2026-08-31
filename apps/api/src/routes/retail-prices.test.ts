import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const WAREHOUSE_UNIT_2 = '00000000-0000-4000-8000-000000000003';
const ITEM_A = '00000000-0000-4000-8000-000000000011';

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

function item(partial: Partial<ItemRecord> & { id: string }): ItemRecord {
  return {
    sku: null,
    name: '测试物品',
    barcode: null,
    specUnit: 'PIECE',
    innerUnit: null,
    innerCount: null,
    isPerishable: false,
    category: null,
    description: null,
    status: 'ACTIVE',
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const collector = user({ entraSub: 'collector', role: 'COLLECTOR' });
const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE', name: '仓库管理员' });
const retailer = user({ entraSub: 'retailer', role: 'RETAILER' });

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '匈牙利仓库' }),
  unit({ id: WAREHOUSE_UNIT_2, type: 'WAREHOUSE', name: '布达佩斯二仓' }),
];
const items = [item({ id: ITEM_A, name: '苹果', specUnit: 'PIECE' })];

function makeApp(seed: { users?: UserRecord[]; units?: UnitRecord[]; items?: ItemRecord[] } = {}) {
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

/** 手动入库并过账，返回 batchId。 */
async function seedStock(app: Awaited<ReturnType<typeof makeApp>>['app']) {
  const created = await app.request('/api/v1/inbound-orders', {
    method: 'POST',
    headers: json('warehouse'),
    body: JSON.stringify({
      warehouseUnitId: WAREHOUSE_UNIT,
      counterpartyUnitId: COLLECTOR_UNIT,
      lines: [
        {
          itemId: ITEM_A,
          qty: '5',
          unitCost: '2.00',
          batchNo: 'B-PRICE',
          expiryDate: '2025-12-31',
        },
      ],
    }),
  });
  expect(created.status).toBe(201);
  const inboundId = ((await created.json()) as { data: { id: string } }).data.id;
  const posted = await app.request(`/api/v1/inbound-orders/${inboundId}/post`, {
    method: 'POST',
    headers: json('warehouse'),
  });
  expect(posted.status).toBe(200);
  const payload = (await posted.json()) as { data: { items: Array<{ batchId: string }> } };
  return payload.data.items[0].batchId;
}

describe('ck-08b 零售价', () => {
  it('PUT 设置零售价：返回 unitCost 只读参考（入库加权原价），不可被输入覆盖', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    await seedStock(app);

    const res = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse'),
      body: JSON.stringify({
        unitId: WAREHOUSE_UNIT,
        itemId: ITEM_A,
        price: '10.00',
        currency: 'USD',
        unitCost: '99.00', // 试图篡改入库原价 → 应被忽略
      }),
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      data: {
        unitId: string;
        itemId: string;
        price: string;
        currency: string;
        unitCost: string | null;
        updatedByName: string | null;
      };
    };
    expect(payload.data).toMatchObject({
      unitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      price: '10.00',
      currency: 'USD',
      unitCost: '2.00',
      updatedByName: '仓库管理员',
    });

    const list = await app.request('/api/v1/retail-prices', { headers: auth('warehouse') });
    expect(list.status).toBe(200);
    const listPayload = (await list.json()) as { data: { items: Array<{ unitCost: string | null }> } };
    expect(listPayload.data.items[0].unitCost).toBe('2.00');
  });

  it('改价写历史：历史按时间倒序，记录 updatedBy/updatedAt', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });

    const first = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse'),
      body: JSON.stringify({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A, price: '10.00' }),
    });
    expect(first.status).toBe(200);

    const second = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse'),
      body: JSON.stringify({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A, price: '12.50', currency: 'CNY' }),
    });
    expect(second.status).toBe(200);

    const history = await app.request(
      `/api/v1/retail-prices/${WAREHOUSE_UNIT}/${ITEM_A}/history`,
      { headers: auth('warehouse') },
    );
    expect(history.status).toBe(200);
    const payload = (await history.json()) as {
      data: { items: Array<{ price: string; currency: string; updatedBy: string; updatedByName: string | null; updatedAt: string }> };
    };
    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items[0]).toMatchObject({
      price: '12.50',
      currency: 'CNY',
      updatedByName: '仓库管理员',
    });
    expect(payload.data.items[1].price).toBe('10.00');
    expect(typeof payload.data.items[0].updatedAt).toBe('string');
    expect(typeof payload.data.items[0].updatedBy).toBe('string');

    // 仓储层：历史上不会出现 unitCost 字段（不可变）。
    const raw = await repos.retailPrices.listHistory(WAREHOUSE_UNIT, ITEM_A);
    expect('unitCost' in raw[0]).toBe(false);
  });

  it('校验与权限：非仓库单元 400；物品不存在 404；RETAILER 写 403、读 200；scope 越界 403', async () => {
    const scoped = user({
      entraSub: 'warehouse-scoped',
      role: 'WAREHOUSE',
      scopeUnitId: WAREHOUSE_UNIT_2,
    });
    const { app } = makeApp({ users: [collector, warehouse, retailer, scoped], units, items });

    const badUnit = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse'),
      body: JSON.stringify({ unitId: COLLECTOR_UNIT, itemId: ITEM_A, price: '10.00' }),
    });
    expect(badUnit.status).toBe(400);

    const badItem = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse'),
      body: JSON.stringify({
        unitId: WAREHOUSE_UNIT,
        itemId: '00000000-0000-4000-8000-000000000099',
        price: '10.00',
      }),
    });
    expect(badItem.status).toBe(404);

    const forbiddenRole = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('retailer'),
      body: JSON.stringify({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A, price: '10.00' }),
    });
    expect(forbiddenRole.status).toBe(403);

    const read = await app.request('/api/v1/retail-prices', { headers: auth('retailer') });
    expect(read.status).toBe(200);

    const forbiddenScope = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse-scoped'),
      body: JSON.stringify({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A, price: '10.00' }),
    });
    expect(forbiddenScope.status).toBe(403);

    // 先由无 scope 的仓库写一条（匈牙利仓），再让 scoped（二仓）读历史 → 403。
    await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse'),
      body: JSON.stringify({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A, price: '10.00' }),
    });
    const history = await app.request(
      `/api/v1/retail-prices/${WAREHOUSE_UNIT}/${ITEM_A}/history`,
      { headers: auth('warehouse-scoped') },
    );
    expect(history.status).toBe(403);
  });
});
