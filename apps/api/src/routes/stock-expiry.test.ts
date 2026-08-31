import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const ITEM_A = '00000000-0000-4000-8000-000000000011';

/** 相对「今天（UTC）」偏移 N 天的日期字符串（避免测试对绝对日期敏感）。 */
function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

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
const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE' });
const retailer = user({ entraSub: 'retailer', role: 'RETAILER' });
const admin = user({ entraSub: 'admin', role: 'ADMIN' });

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '匈牙利仓库' }),
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
  opts: { batchNo: string; qty: string; expiryDate: string | null },
) {
  const created = await app.request('/api/v1/inbound-orders', {
    method: 'POST',
    headers: json('warehouse'),
    body: JSON.stringify({
      warehouseUnitId: WAREHOUSE_UNIT,
      counterpartyUnitId: COLLECTOR_UNIT,
      lines: [
        {
          itemId: ITEM_A,
          qty: opts.qty,
          unitCost: '2.00',
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
  const payload = (await posted.json()) as { data: { items: Array<{ batchId: string }> } };
  return payload.data.items[0].batchId;
}

describe('ck-08b 效期视图', () => {
  it('GET /stock/batches：返回 remainingDays/isExpired，按到期日升序；无到期日为 null 且排在最后', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    await seedStock(app, { batchNo: 'B-EXPIRED', qty: '3', expiryDate: isoDay(-2) });
    await seedStock(app, { batchNo: 'B-SOON', qty: '4', expiryDate: isoDay(5) });
    await seedStock(app, { batchNo: 'B-LATE', qty: '5', expiryDate: isoDay(30) });
    await seedStock(app, { batchNo: 'B-NOEXP', qty: '2', expiryDate: null });

    const res = await app.request('/api/v1/stock/batches', { headers: auth('warehouse') });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      data: { items: Array<{ batchNo: string | null; remainingDays: number | null; isExpired: boolean }> };
    };
    const rows = payload.data.items;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ batchNo: 'B-EXPIRED', remainingDays: -2, isExpired: true });
    expect(rows[1]).toMatchObject({ batchNo: 'B-SOON', remainingDays: 5, isExpired: false });
    expect(rows[2]).toMatchObject({ batchNo: 'B-LATE', remainingDays: 30, isExpired: false });
    expect(rows[3]).toMatchObject({ batchNo: 'B-NOEXP', remainingDays: null, isExpired: false });
  });

  it('GET /stock/expired?unitId=：仅返回已过期批次；缺 unitId → 400；scope 自动生效', async () => {
    const scoped = user({
      entraSub: 'warehouse-scoped',
      role: 'WAREHOUSE',
      scopeUnitId: WAREHOUSE_UNIT,
    });
    const { app } = makeApp({ users: [collector, warehouse, scoped, admin], units, items });
    await seedStock(app, { batchNo: 'B-EXPIRED', qty: '3', expiryDate: isoDay(-2) });
    await seedStock(app, { batchNo: 'B-SOON', qty: '4', expiryDate: isoDay(5) });

    const expired = await app.request(
      `/api/v1/stock/expired?unitId=${WAREHOUSE_UNIT}`,
      { headers: auth('warehouse') },
    );
    expect(expired.status).toBe(200);
    const payload = (await expired.json()) as {
      data: { items: Array<{ batchNo: string | null; isExpired: boolean }> };
    };
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({ batchNo: 'B-EXPIRED', isExpired: true });

    const noUnit = await app.request('/api/v1/stock/expired', { headers: auth('admin') });
    expect(noUnit.status).toBe(400);

    const scopedRes = await app.request('/api/v1/stock/expired', { headers: auth('warehouse-scoped') });
    expect(scopedRes.status).toBe(200);
    const scopedPayload = (await scopedRes.json()) as { data: { items: unknown[] } };
    expect(scopedPayload.data.items).toHaveLength(1);
  });

  it('权限：RETAILER 可读效期视图（STOCK_READ）', async () => {
    const { app } = makeApp({ users: [collector, warehouse, retailer], units, items });
    await seedStock(app, { batchNo: 'B-SOON', qty: '4', expiryDate: isoDay(5) });
    const res = await app.request('/api/v1/stock/batches', { headers: auth('retailer') });
    expect(res.status).toBe(200);
  });
});
