import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const WAREHOUSE_UNIT_2 = '00000000-0000-4000-8000-000000000003';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000004';
const ITEM_A = '00000000-0000-4000-8000-000000000011';
const PHOTO_1 = '00000000-0000-4000-8000-000000000099';

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

const collector = user({ entraSub: 'collector', role: 'COLLECTOR', scopeUnitId: COLLECTOR_UNIT });
const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
const retailer = user({ entraSub: 'retailer', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });

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
async function seedStock(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  opts: { warehouseUnitId: string; itemId: string; qty: string; unitCost: string; batchNo: string; expiryDate: string },
) {
  const created = await app.request('/api/v1/inbound-orders', {
    method: 'POST',
    headers: json('warehouse'),
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
    headers: json('warehouse'),
  });
  expect(posted.status).toBe(200);
  const payload = (await posted.json()) as { data: { items: Array<{ batchId: string; qty: string }> } };
  return { batchId: payload.data.items[0].batchId, qty: payload.data.items[0].qty };
}

describe('ck-08b 报损单（type=LOSS）', () => {
  it('创建校验：缺原因 / 缺附图 / 行缺批次 → 400 VALIDATION_ERROR', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { batchId } = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '2.00',
      batchNo: 'B-LOSS',
      expiryDate: '2025-12-31',
    });

    const noReason = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        type: 'LOSS',
        photoFileIds: [PHOTO_1],
        lines: [{ itemId: ITEM_A, qty: '1', batchId }],
      }),
    });
    expect(noReason.status).toBe(400);

    const noPhoto = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        type: 'LOSS',
        lossReason: '过期',
        lines: [{ itemId: ITEM_A, qty: '1', batchId }],
      }),
    });
    expect(noPhoto.status).toBe(400);

    const noBatch = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        type: 'LOSS',
        lossReason: '过期',
        photoFileIds: [PHOTO_1],
        lines: [{ itemId: ITEM_A, qty: '1' }],
      }),
    });
    expect(noBatch.status).toBe(400);
    const body = (await noBatch.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('创建并过账：扣减指定批次 + 写 OUTBOUND_LOSS 流水', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });
    const { batchId } = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '2.00',
      batchNo: 'B-LOSS',
      expiryDate: '2025-12-31',
    });

    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        type: 'LOSS',
        lossReason: '运输破损',
        photoFileIds: [PHOTO_1],
        lines: [{ itemId: ITEM_A, qty: '3', batchId }],
      }),
    });
    expect(created.status).toBe(201);
    const draft = (await created.json()) as {
      data: { id: string; type: string; lossReason: string; photoFileIds: string[] };
    };
    expect(draft.data.type).toBe('LOSS');
    expect(draft.data.lossReason).toBe('运输破损');
    expect(draft.data.photoFileIds).toEqual([PHOTO_1]);

    const posted = await app.request(`/api/v1/outbound-orders/${draft.data.id}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);
    const payload = (await posted.json()) as { data: { status: string; items: Array<{ batchId: string; qty: string }> } };
    expect(payload.data.status).toBe('POSTED');
    expect(payload.data.items[0]).toMatchObject({ batchId, qty: '3.00' });

    const stock = await repos.stock.list({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A });
    expect(stock.items[0].qty).toBe('2');

    const movements = await repos.stock.listMovements({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A });
    expect(movements.items.filter((m) => m.type === 'OUTBOUND_LOSS')).toHaveLength(1);
  });

  it('余额不足：过账 → 409 INSUFFICIENT_STOCK 且不扣减', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });
    const { batchId } = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '1',
      unitCost: '2.00',
      batchNo: 'B-LOSS',
      expiryDate: '2025-12-31',
    });

    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        type: 'LOSS',
        lossReason: '过期',
        photoFileIds: [PHOTO_1],
        lines: [{ itemId: ITEM_A, qty: '5', batchId }],
      }),
    });
    const draftId = ((await created.json()) as { data: { id: string } }).data.id;
    const failed = await app.request(`/api/v1/outbound-orders/${draftId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(failed.status).toBe(409);
    expect(await failed.json()).toMatchObject({ error: { code: 'INSUFFICIENT_STOCK' } });
    const stock = await repos.stock.list({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A });
    expect(stock.items[0].qty).toBe('1');
  });

  it('权限与 scope：RETAILER 写 403；scope 越界 403', async () => {
    const scoped = user({
      entraSub: 'warehouse-scoped',
      role: 'WAREHOUSE',
      scopeUnitId: WAREHOUSE_UNIT_2,
    });
    const { app } = makeApp({ users: [collector, warehouse, retailer, scoped], units, items });
    const { batchId } = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '2',
      unitCost: '1.00',
      batchNo: 'B-LOSS',
      expiryDate: '2025-12-31',
    });
    const body = {
      warehouseUnitId: WAREHOUSE_UNIT,
      type: 'LOSS',
      lossReason: '过期',
      photoFileIds: [PHOTO_1],
      lines: [{ itemId: ITEM_A, qty: '1', batchId }],
    };
    const forbiddenRole = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('retailer'),
      body: JSON.stringify(body),
    });
    expect(forbiddenRole.status).toBe(403);

    const forbiddenScope = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse-scoped'),
      body: JSON.stringify(body),
    });
    expect(forbiddenScope.status).toBe(403);
  });
});
