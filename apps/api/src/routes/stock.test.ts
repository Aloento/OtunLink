import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const WAREHOUSE_UNIT_2 = '00000000-0000-4000-8000-000000000003';
const ITEM_A = '00000000-0000-4000-8000-000000000011';
const ITEM_B = '00000000-0000-4000-8000-000000000012';

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

const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE' });
const warehouseB2 = user({ entraSub: 'warehouse-b2', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT_2 });
const collector = user({ entraSub: 'collector', role: 'COLLECTOR' });
const admin = user({ entraSub: 'admin', role: 'ADMIN' });

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '匈牙利仓库' }),
  unit({ id: WAREHOUSE_UNIT_2, type: 'WAREHOUSE', name: '布达佩斯二仓' }),
];
const items = [
  item({ id: ITEM_A, name: '苹果', specUnit: 'PIECE' }),
  item({ id: ITEM_B, name: '香蕉', specUnit: 'BOX' }),
];

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

async function inboundPost(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  opts: { warehouseUnitId: string; itemId: string; qty: string; unitCost: string; batchNo: string; expiryDate: string },
  token = 'warehouse',
): Promise<{ batchId: string }> {
  const created = await app.request('/api/v1/inbound-orders', {
    method: 'POST',
    headers: json(token),
    body: JSON.stringify({
      warehouseUnitId: opts.warehouseUnitId,
      counterpartyUnitId: COLLECTOR_UNIT,
      lines: [
        {
          itemId: opts.itemId,
          qty: opts.qty,
          unitCost: opts.unitCost,
          batchNo: opts.batchNo,
          expiryDate: opts.expiryDate,
        },
      ],
    }),
  });
  expect(created.status).toBe(201);
  const inboundId = ((await created.json()) as { data: { id: string } }).data.id;
  const posted = await app.request(`/api/v1/inbound-orders/${inboundId}/post`, {
    method: 'POST',
    headers: json(token),
  });
  expect(posted.status).toBe(200);
  const payload = (await posted.json()) as { data: { items: Array<{ batchId: string }> } };
  return { batchId: payload.data.items[0].batchId };
}

describe('ck-08a 库存台账', () => {
  it('台账列表：仓库/物品/批次字段 + 筛选 + 分页；流水最新在前', async () => {
    const { app } = makeApp({ users: [warehouse, collector], units, items });
    await inboundPost(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '2.50',
      batchNo: 'B-A1',
      expiryDate: '2025-06-01',
    });
    await inboundPost(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_B,
      qty: '3',
      unitCost: '4.00',
      batchNo: 'B-B1',
      expiryDate: '2025-12-31',
    });

    const list = await app.request('/api/v1/stock?page=1&size=1', {
      headers: auth('warehouse'),
    });
    expect(list.status).toBe(200);
    const payload = (await list.json()) as {
      data: { total: number; page: number; size: number; items: Array<Record<string, unknown>> };
    };
    expect(payload.data.total).toBe(2);
    expect(payload.data.size).toBe(1);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({
      unitName: '匈牙利仓库',
      itemName: '苹果',
      spec: 'PIECE',
      batchNo: 'B-A1',
      expiryDate: '2025-06-01',
      qty: '5',
      avgCost: '2.5',
    });

    const filtered = await app.request(`/api/v1/stock?itemId=${ITEM_B}`, {
      headers: auth('warehouse'),
    });
    const filteredPayload = (await filtered.json()) as {
      data: { total: number; items: Array<{ batchNo: string }> };
    };
    expect(filteredPayload.data.total).toBe(1);
    expect(filteredPayload.data.items[0].batchNo).toBe('B-B1');

    const movements = await app.request('/api/v1/stock/movements?unitId=' + WAREHOUSE_UNIT, {
      headers: auth('warehouse'),
    });
    expect(movements.status).toBe(200);
    const mPayload = (await movements.json()) as {
      data: { total: number; items: Array<{ type: string; qtyDelta: string; batchNo: string | null }> };
    };
    expect(mPayload.data.total).toBe(2);
    // 最新在前：后建的 B-B1 为第一条。
    expect(mPayload.data.items[0]).toMatchObject({ type: 'INBOUND_MANUAL', batchNo: 'B-B1' });
    expect(mPayload.data.items[1]).toMatchObject({ type: 'INBOUND_MANUAL', batchNo: 'B-A1' });
  });

  it('出库后台账扣减为 0 的行不再展示；流水含 OUTBOUND_NORMAL', async () => {
    const { app } = makeApp({ users: [warehouse], units, items });
    const { batchId } = await inboundPost(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '2.00',
      batchNo: 'B-A1',
      expiryDate: '2025-06-01',
    });

    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '5', batchId }],
      }),
    });
    const outboundId = ((await created.json()) as { data: { id: string } }).data.id;
    const posted = await app.request(`/api/v1/outbound-orders/${outboundId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);

    const list = await app.request('/api/v1/stock', { headers: auth('warehouse') });
    expect(((await list.json()) as { data: { total: number } }).data.total).toBe(0);

    const movements = await app.request('/api/v1/stock/movements', {
      headers: auth('warehouse'),
    });
    const mPayload = (await movements.json()) as {
      data: { items: Array<{ type: string; qtyDelta: string; refNo: string | null }> };
    };
    expect(mPayload.data.items[0]).toMatchObject({ type: 'OUTBOUND_NORMAL', qtyDelta: '-5' });
  });

  it('scope：仓库仅见本仓；管理员全量；集货方 403', async () => {
    const warehouseScoped = user({ entraSub: 'warehouse-scoped', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
    const { app } = makeApp({
      users: [warehouseScoped, warehouseB2, admin, collector],
      units,
      items,
    });
    await inboundPost(
      app,
      {
        warehouseUnitId: WAREHOUSE_UNIT,
        itemId: ITEM_A,
        qty: '5',
        unitCost: '2.00',
        batchNo: 'B-A1',
        expiryDate: '2025-06-01',
      },
      'warehouse-scoped',
    );
    await inboundPost(
      app,
      {
        warehouseUnitId: WAREHOUSE_UNIT_2,
        itemId: ITEM_B,
        qty: '2',
        unitCost: '3.00',
        batchNo: 'B-B2',
        expiryDate: '2025-08-01',
      },
      'warehouse-b2',
    );

    const scoped = await app.request('/api/v1/stock', { headers: auth('warehouse-scoped') });
    const scopedPayload = (await scoped.json()) as {
      data: { total: number; items: Array<{ unitId: string }> };
    };
    expect(scopedPayload.data.total).toBe(1);
    expect(scopedPayload.data.items[0].unitId).toBe(WAREHOUSE_UNIT);

    const scopedB2 = await app.request('/api/v1/stock', { headers: auth('warehouse-b2') });
    const scopedB2Payload = (await scopedB2.json()) as {
      data: { total: number; items: Array<{ unitId: string }> };
    };
    expect(scopedB2Payload.data.total).toBe(1);
    expect(scopedB2Payload.data.items[0].unitId).toBe(WAREHOUSE_UNIT_2);

    const all = await app.request('/api/v1/stock', { headers: auth('admin') });
    expect(((await all.json()) as { data: { total: number } }).data.total).toBe(2);

    const forbiddenRole = await app.request('/api/v1/stock', { headers: auth('collector') });
    expect(forbiddenRole.status).toBe(403);
  });
});
