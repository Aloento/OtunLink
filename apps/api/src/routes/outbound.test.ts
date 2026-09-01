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

const collector = user({ entraSub: 'collector', role: 'COLLECTOR', scopeUnitId: COLLECTOR_UNIT });
const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
const warehouse2 = user({ entraSub: 'warehouse2', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT_2 });
const retailer = user({ entraSub: 'retailer', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });
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

/** 手动入库并过账，返回 { inboundId, batchId, qty }（batchId 为过账后明细行批次）。 */
async function seedStock(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  opts: {
    warehouseUnitId: string;
    itemId: string;
    qty: string;
    unitCost: string;
    batchNo: string;
    expiryDate: string;
    as?: string;
  },
) {
  const token = opts.as ?? 'warehouse';
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
  const payload = (await posted.json()) as {
    data: { items: Array<{ batchId: string; qty: string }> };
  };
  return { inboundId, batchId: payload.data.items[0].batchId, qty: payload.data.items[0].qty };
}

describe(' 手动出库单', () => {
  it('创建校验：非仓库目标 → 400；物品不存在 → 400；集货方写 → 403；scope 越界 → 403', async () => {
    const scoped = user({
      entraSub: 'warehouse-scoped',
      role: 'WAREHOUSE',
      scopeUnitId: WAREHOUSE_UNIT_2,
    });
    const { app } = makeApp({ users: [collector, warehouse, scoped, admin], units, items });
    const valid = {
      warehouseUnitId: WAREHOUSE_UNIT,
      lines: [{ itemId: ITEM_A, qty: '1' }],
    };

    const badUnit = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('admin'),
      body: JSON.stringify({
        warehouseUnitId: COLLECTOR_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1' }],
      }),
    });
    expect(badUnit.status).toBe(400);

    const badItem = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: '00000000-0000-4000-8000-000000000099', qty: '1' }],
      }),
    });
    expect(badItem.status).toBe(400);

    const forbiddenRole = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(valid),
    });
    expect(forbiddenRole.status).toBe(403);

    const forbiddenScope = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse-scoped'),
      body: JSON.stringify(valid),
    });
    expect(forbiddenScope.status).toBe(403);
  });

  it('创建 DRAFT（不含批次）→ 过账 FEFO 拆批扣减 + 回填成本快照', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });
    // 先建两个批次库存：6月到期 4 @2.00，12月到期 6 @3.00。
    const earlier = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '4',
      unitCost: '2.00',
      batchNo: 'B-EARLY',
      expiryDate: '2025-06-01',
    });
    const later = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '6',
      unitCost: '3.00',
      batchNo: 'B-LATE',
      expiryDate: '2025-12-31',
    });

    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        remark: '手动出库',
        lines: [{ itemId: ITEM_A, qty: '10' }],
      }),
    });
    expect(created.status).toBe(201);
    const draft = (await created.json()) as {
      data: { id: string; status: string; items: Array<{ batchId: string | null }> };
    };
    expect(draft.data.status).toBe('DRAFT');
    expect(draft.data.items[0].batchId).toBeNull();

    const posted = await app.request(`/api/v1/outbound-orders/${draft.data.id}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);
    const payload = (await posted.json()) as {
      data: { id: string; status: string; items: Array<{ batchId: string; qty: string; unitCost: string }> };
    };
    expect(payload.data.status).toBe('POSTED');
    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items[0]).toMatchObject({ batchId: earlier.batchId, qty: '4.00', unitCost: '2.00' });
    expect(payload.data.items[1]).toMatchObject({ batchId: later.batchId, qty: '6.00', unitCost: '3.00' });

    const stockRows = await repos.stock.list({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A });
    expect(stockRows.total).toBe(0);

    const movements = await repos.stock.listMovements({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A });
    expect(movements.items.filter((m) => m.type === 'OUTBOUND_NORMAL')).toHaveLength(2);
  });

  it('指定批次过账：扣减该批次并写流水；不足 → 409 INSUFFICIENT_STOCK 且不产生部分扣减', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });
    const { batchId } = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '2.50',
      batchNo: 'B-ONE',
      expiryDate: '2025-12-31',
    });

    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '3', batchId }],
      }),
    });
    const draftId = ((await created.json()) as { data: { id: string } }).data.id;
    const posted = await app.request(`/api/v1/outbound-orders/${draftId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);
    const payload = (await posted.json()) as {
      data: { items: Array<{ batchId: string; qty: string; unitCost: string }> };
    };
    expect(payload.data.items[0]).toMatchObject({ batchId, qty: '3.00', unitCost: '2.50' });
    const after = await repos.stock.list({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A });
    expect(after.items[0].qty).toBe('2');

    const tooMuch = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '9', batchId }],
      }),
    });
    const tooMuchId = ((await tooMuch.json()) as { data: { id: string } }).data.id;
    const failed = await app.request(`/api/v1/outbound-orders/${tooMuchId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(failed.status).toBe(409);
    expect(await failed.json()).toMatchObject({ error: { code: 'INSUFFICIENT_STOCK' } });
    const unchanged = await repos.stock.list({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A });
    expect(unchanged.items[0].qty).toBe('2');
  });

  it('指定批次无库存/跨仓库批次 → 409 STOCK_BATCH_NOT_FOUND；二次过账 → 409 OUTBOUND_STATE_CONFLICT', async () => {
    const { app } = makeApp({ users: [collector, warehouse, warehouse2], units, items });
    const { batchId } = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT_2,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '1.00',
      batchNo: 'B-OTHER',
      expiryDate: '2025-12-31',
      as: 'warehouse2',
    });

    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1', batchId }],
      }),
    });
    const draftId = ((await created.json()) as { data: { id: string } }).data.id;
    const failed = await app.request(`/api/v1/outbound-orders/${draftId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(failed.status).toBe(409);
    expect(await failed.json()).toMatchObject({ error: { code: 'STOCK_BATCH_NOT_FOUND' } });

    // 先正常过账一个，再二次过账 → 状态冲突。
    const ok = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse2'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT_2,
        lines: [{ itemId: ITEM_A, qty: '1', batchId }],
      }),
    });
    const okId = ((await ok.json()) as { data: { id: string } }).data.id;
    const posted = await app.request(`/api/v1/outbound-orders/${okId}/post`, {
      method: 'POST',
      headers: json('warehouse2'),
    });
    expect(posted.status).toBe(200);
    const again = await app.request(`/api/v1/outbound-orders/${okId}/post`, {
      method: 'POST',
      headers: json('warehouse2'),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'OUTBOUND_STATE_CONFLICT' } });
  });

  it('列表/详情：仓库可见并按 scope 过滤', async () => {
    const scoped = user({
      entraSub: 'warehouse-b2',
      role: 'WAREHOUSE',
      scopeUnitId: WAREHOUSE_UNIT_2,
    });
    const { app } = makeApp({ users: [collector, warehouse, scoped], units, items });
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '1.00',
      batchNo: 'B-1',
      expiryDate: '2025-12-31',
    });
    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '5' }],
      }),
    });
    const draftId = ((await created.json()) as { data: { id: string } }).data.id;

    const list = await app.request('/api/v1/outbound-orders', { headers: auth('warehouse') });
    expect(list.status).toBe(200);
    const listPayload = (await list.json()) as {
      data: { total: number; items: Array<{ id: string; warehouseName: string | null }> };
    };
    expect(listPayload.data.total).toBe(1);
    expect(listPayload.data.items[0].warehouseName).toBe('匈牙利仓库');

    const scopedList = await app.request('/api/v1/outbound-orders', {
      headers: auth('warehouse-b2'),
    });
    expect(((await scopedList.json()) as { data: { total: number } }).data.total).toBe(0);

    const detail = await app.request(`/api/v1/outbound-orders/${draftId}`, {
      headers: auth('warehouse'),
    });
    expect(detail.status).toBe(200);
    const scopedDetail = await app.request(`/api/v1/outbound-orders/${draftId}`, {
      headers: auth('warehouse-b2'),
    });
    expect(scopedDetail.status).toBe(403);
  });

  it('权限：RETAILER 读 200、写 403', async () => {
    const { app } = makeApp({
      users: [collector, warehouse, retailer],
      units,
      items,
    });
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '1.00',
      batchNo: 'B-1',
      expiryDate: '2025-12-31',
    });

    const list = await app.request('/api/v1/outbound-orders', { headers: auth('retailer') });
    expect(list.status).toBe(200);

    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('retailer'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1' }],
      }),
    });
    expect(created.status).toBe(403);
  });

  it('管理员（无 scope）可读全部，库存台账归 stock 路由', async () => {
    const { app } = makeApp({ users: [admin, warehouse], units, items });
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_B,
      qty: '5',
      unitCost: '4.00',
      batchNo: 'B-BAN',
      expiryDate: '2025-12-31',
    });
    const list = await app.request('/api/v1/outbound-orders', { headers: auth('admin') });
    expect(list.status).toBe(200);
    expect(((await list.json()) as { data: { total: number } }).data.total).toBe(0);
  });

  it('删除 DRAFT 出库单成功，随后 GET 404', async () => {
    const { app } = makeApp({ users: [warehouse], units, items });
    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1' }],
      }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const del = await app.request(`/api/v1/outbound-orders/${id}`, {
      method: 'DELETE',
      headers: auth('warehouse'),
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ data: { id } });

    const get = await app.request(`/api/v1/outbound-orders/${id}`, { headers: auth('warehouse') });
    expect(get.status).toBe(404);
  });

  it('非 DRAFT（POSTED）出库单删除返回 409 OUTBOUND_STATE_CONFLICT', async () => {
    const { app } = makeApp({ users: [warehouse], units, items });
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: '5',
      unitCost: '1.00',
      batchNo: 'B-DEL',
      expiryDate: '2025-12-31',
    });
    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1' }],
      }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    await app.request(`/api/v1/outbound-orders/${id}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });

    const del = await app.request(`/api/v1/outbound-orders/${id}`, {
      method: 'DELETE',
      headers: auth('warehouse'),
    });
    expect(del.status).toBe(409);
    expect(await del.json()).toMatchObject({ error: { code: 'OUTBOUND_STATE_CONFLICT' } });
  });

  it('无 STOCK_WRITE 权限（COLLECTOR）删除出库单返回 403', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const created = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1' }],
      }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const del = await app.request(`/api/v1/outbound-orders/${id}`, {
      method: 'DELETE',
      headers: auth('collector'),
    });
    expect(del.status).toBe(403);
  });

  it('删除不存在的出库单返回 404', async () => {
    const { app } = makeApp({ users: [warehouse], units, items });
    const del = await app.request('/api/v1/outbound-orders/00000000-0000-4000-8000-0000000000ff', {
      method: 'DELETE',
      headers: auth('warehouse'),
    });
    expect(del.status).toBe(404);
  });
});
