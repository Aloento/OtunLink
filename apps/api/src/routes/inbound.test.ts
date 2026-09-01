import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type {
  InboundOrderItemRecord,
  ItemRecord,
  TokenClaims,
  UnitRecord,
  UserRecord,
} from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
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

const collector = user({ entraSub: 'collector', role: 'COLLECTOR', scopeUnitId: COLLECTOR_UNIT });
const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
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

describe(' 确认收货 → 入库建档', () => {
  async function readyShipment(app: Awaited<ReturnType<typeof makeApp>>['app']) {
    const created = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({
        shipperUnitId: COLLECTOR_UNIT,
        receiverUnitId: WAREHOUSE_UNIT,
        boxesCount: 1,
        trackings: [{ carrier: 'SF', trackingNo: 'SF123' }],
        currency: 'CNY',
        items: [{ itemId: ITEM_A, expectedQty: 5, unitPrice: '1.50' }],
      }),
    });
    expect(created.status).toBe(201);
    const shipmentId = ((await created.json()) as { data: { id: string } }).data.id;

    await app.request(`/api/v1/shipments/${shipmentId}/send`, {
      method: 'POST',
      headers: json('collector'),
    });
    await app.request(`/api/v1/shipments/${shipmentId}/start-counting`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    const detail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    const detailPayload = (await detail.json()) as { data: { items: Array<{ id: string }> } };
    const itemId = detailPayload.data.items[0].id;
    const counted = await app.request(`/api/v1/shipments/${shipmentId}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ version: 0, items: [{ shipmentItemId: itemId, actualQty: '5' }] }),
    });
    expect(counted.status).toBe(200);
    return { shipmentId, itemId };
  }

  it('确认收货：READY → 自动建档 DRAFT 入库单，发货单 INBOUNDED', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const res = await app.request(`/api/v1/shipments/${shipmentId}/confirm-receipt`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        remark: '确认入库',
        items: [{ shipmentItemId: itemId, batchNo: 'B-APPLE-01' }],
      }),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: { id: string; status: string; shipmentId: string; items: Array<Record<string, unknown>> };
    };
    expect(payload.data.status).toBe('DRAFT');
    expect(payload.data.shipmentId).toBe(shipmentId);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0].batchNo).toBe('B-APPLE-01');
    expect(payload.data.items[0].unitCost).toBe('1.50');
    expect(payload.data.items[0].qty).toBe('5.00');

    const shipmentDetail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    const shipmentPayload = (await shipmentDetail.json()) as { data: { status: string } };
    expect(shipmentPayload.data.status).toBe('INBOUNDED');
  });

  it('非 READY 状态确认收货 → 409 SHIPMENT_NOT_READY', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const created = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({
        shipperUnitId: COLLECTOR_UNIT,
        receiverUnitId: WAREHOUSE_UNIT,
        boxesCount: 1,
        trackings: [{ carrier: 'SF', trackingNo: 'SF123' }],
        currency: 'CNY',
        items: [{ itemId: ITEM_A, expectedQty: 5, unitPrice: '1.50' }],
      }),
    });
    const shipmentId = ((await created.json()) as { data: { id: string } }).data.id;

    const res = await app.request(`/api/v1/shipments/${shipmentId}/confirm-receipt`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'SHIPMENT_NOT_READY' } });
  });

  it('确认收货权限：集货方 → 403', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const res = await app.request(`/api/v1/shipments/${shipmentId}/confirm-receipt`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, batchNo: 'B-01' }] }),
    });
    expect(res.status).toBe(403);
  });

  it('入库过账：建档批次、写库存与台账，unit_cost 只读', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const confirmed = await app.request(`/api/v1/shipments/${shipmentId}/confirm-receipt`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        items: [{ shipmentItemId: itemId, batchNo: 'B-APPLE-01' }],
      }),
    });
    const inboundId = ((await confirmed.json()) as { data: { id: string } }).data.id;

    const posted = await app.request(`/api/v1/inbound-orders/${inboundId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);
    const postedPayload = (await posted.json()) as {
      data: { id: string; status: string; items: Array<{ batchId: string | null; unitCost: string }> };
    };
    expect(postedPayload.data.status).toBe('POSTED');
    expect(postedPayload.data.items[0].batchId).toBeTruthy();
    expect(postedPayload.data.items[0].unitCost).toBe('1.50');

    const memoryInbound = repos.inbounds as unknown as {
      batches: Map<string, { itemId: string; batchNo: string }>;
      stock: Map<string, { qty: number; avgCost: number }>;
      movements: Array<{ type: string; qtyDelta: number; unitCost: number }>;
    };
    expect(memoryInbound.batches.size).toBe(1);
    expect([...memoryInbound.batches.values()][0].batchNo).toBe('B-APPLE-01');
    expect(memoryInbound.stock.size).toBe(1);
    const stockRow = [...memoryInbound.stock.values()][0];
    expect(stockRow.qty).toBe(5);
    expect(stockRow.avgCost).toBe(1.5);
    expect(memoryInbound.movements).toHaveLength(1);
    expect(memoryInbound.movements[0]).toMatchObject({ type: 'INBOUND_SHIPMENT', qtyDelta: 5, unitCost: 1.5 });

    const again = await app.request(`/api/v1/inbound-orders/${inboundId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'INBOUND_STATE_CONFLICT' } });
  });

  it('入库单列表/详情：仓库可见', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);
    await app.request(`/api/v1/shipments/${shipmentId}/confirm-receipt`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, batchNo: 'B-01' }] }),
    });

    const list = await app.request('/api/v1/inbound-orders', { headers: auth('warehouse') });
    expect(list.status).toBe(200);
    const listPayload = (await list.json()) as { data: { total: number; items: Array<{ id: string }> } };
    expect(listPayload.data.total).toBe(1);

    const detail = await app.request(`/api/v1/inbound-orders/${listPayload.data.items[0].id}`, {
      headers: auth('warehouse'),
    });
    expect(detail.status).toBe(200);
  });

  it('批次行含生产/到期日：按 物品+效期 归并', async () => {
    const perishable = item({ id: ITEM_A, name: '鲜奶', isPerishable: true });
    const { app } = makeApp({
      users: [collector, warehouse],
      units,
      items: [perishable],
    });

    const created = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({
        shipperUnitId: COLLECTOR_UNIT,
        receiverUnitId: WAREHOUSE_UNIT,
        boxesCount: 1,
        trackings: [{ carrier: 'SF', trackingNo: 'SF123' }],
        currency: 'CNY',
        items: [
          { itemId: ITEM_A, expectedQty: 3, unitPrice: '2.00', productionDate: '2025-01-01', expiryDate: '2025-06-01' },
          { itemId: ITEM_A, expectedQty: 2, unitPrice: '2.00', productionDate: '2025-01-01', expiryDate: '2025-06-01' },
        ],
      }),
    });
    const shipmentId = ((await created.json()) as { data: { id: string } }).data.id;
    await app.request(`/api/v1/shipments/${shipmentId}/send`, {
      method: 'POST',
      headers: json('collector'),
    });
    await app.request(`/api/v1/shipments/${shipmentId}/start-counting`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    const detail = await app.request(`/api/v1/shipments/${shipmentId}`, { headers: auth('warehouse') });
    const itemsPayload = (await detail.json()) as { data: { items: Array<{ id: string }> } };
    const counted = await app.request(`/api/v1/shipments/${shipmentId}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        version: 0,
        items: itemsPayload.data.items.map((i, index) => ({
          shipmentItemId: i.id,
          actualQty: index === 0 ? '3' : '2',
        })),
      }),
    });
    expect(counted.status).toBe(200);

    const res = await app.request(`/api/v1/shipments/${shipmentId}/confirm-receipt`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [] }),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { data: { items: InboundOrderItemRecord[] } };
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0].qty).toBe('5.00');
    expect(payload.data.items[0].productionDate).toBe('2025-01-01');
    expect(payload.data.items[0].expiryDate).toBe('2025-06-01');
  });
});

describe(' 手动入库单', () => {
  it('手动入库创建：DRAFT + sourceType=MANUAL + 行字段；再 POST 建档批次/库存/流水', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });

    const created = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        remark: '手动补货',
        lines: [
          {
            itemId: ITEM_A,
            qty: '5',
            unitCost: '2.50',
            batchNo: 'B-MAN-01',
            productionDate: '2025-01-01',
            expiryDate: '2025-12-31',
            lineNote: '渠道批次',
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const payload = (await created.json()) as {
      data: { id: string; sourceType: string; status: string; items: Array<Record<string, unknown>> };
    };
    expect(payload.data.sourceType).toBe('MANUAL');
    expect(payload.data.status).toBe('DRAFT');
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({
      qty: '5',
      unitCost: '2.50',
      batchNo: 'B-MAN-01',
      lineNote: '渠道批次',
    });

    const posted = await app.request(`/api/v1/inbound-orders/${payload.data.id}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);
    const postedPayload = (await posted.json()) as {
      data: { status: string; items: Array<{ batchId: string | null }> };
    };
    expect(postedPayload.data.status).toBe('POSTED');

    const memoryInbound = repos.inbounds as unknown as {
      batches: Map<string, { batchNo: string; sourceType: string }>;
      stock: Map<string, { qty: number; avgCost: number }>;
      movements: Array<{ type: string; qtyDelta: number; unitCost: number; orderId: string }>;
    };
    expect(memoryInbound.batches.size).toBe(1);
    const batch = [...memoryInbound.batches.values()][0];
    expect(batch.batchNo).toBe('B-MAN-01');
    expect(batch.sourceType).toBe('MANUAL');
    const stockRow = [...memoryInbound.stock.values()][0];
    expect(stockRow.qty).toBe(5);
    expect(stockRow.avgCost).toBe(2.5);
    expect(memoryInbound.movements).toHaveLength(1);
    expect(memoryInbound.movements[0]).toMatchObject({
      type: 'INBOUND_MANUAL',
      qtyDelta: 5,
      unitCost: 2.5,
      orderId: payload.data.id,
    });
  });

  it('非易腐物品带生产/到期日：建档后批次 productionDate/expiryDate 为 null', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });

    const created = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        lines: [
          {
            itemId: ITEM_A,
            qty: '3',
            unitCost: '2.00',
            batchNo: 'B-NONPER',
            productionDate: '2025-01-01',
            expiryDate: '2025-12-31',
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const posted = await app.request(`/api/v1/inbound-orders/${id}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);

    const memoryInbound = repos.inbounds as unknown as {
      batches: Map<string, { batchNo: string; productionDate: string | null; expiryDate: string | null }>;
    };
    const batch = [...memoryInbound.batches.values()][0];
    expect(batch.productionDate).toBeNull();
    expect(batch.expiryDate).toBeNull();
  });

  it('入库不填批次号过账：自动生成可读批次号（B-YYYYMMDD-XXXX）', async () => {
    const { app, repos } = makeApp({ users: [collector, warehouse], units, items });

    const created = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        lines: [{ itemId: ITEM_A, qty: '2', unitCost: '1.00' }],
      }),
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const posted = await app.request(`/api/v1/inbound-orders/${id}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(posted.status).toBe(200);

    const memoryInbound = repos.inbounds as unknown as {
      batches: Map<string, { batchNo: string }>;
    };
    const batch = [...memoryInbound.batches.values()][0];
    expect(batch.batchNo).toMatch(/^B-\d{8}-[A-Z0-9]{4}$/);
  });

  it('手动入库校验：非仓库目标 → 400；物品不存在 → 400；非法 JSON → 400', async () => {
    const { app } = makeApp({ users: [collector, warehouse, admin], units, items });

    const badUnit = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('admin'),
      body: JSON.stringify({
        warehouseUnitId: COLLECTOR_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1', unitCost: '1.00' }],
      }),
    });
    expect(badUnit.status).toBe(400);

    const badItem = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        lines: [{ itemId: '00000000-0000-4000-8000-000000000099', qty: '1', unitCost: '1.00' }],
      }),
    });
    expect(badItem.status).toBe(400);

    const badJson = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: auth('warehouse'),
      body: 'not-json',
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('手动入库权限与 scope：集货方 403；scopeUnitId 不匹配 403', async () => {
    const scoped = user({
      entraSub: 'warehouse-scoped',
      role: 'WAREHOUSE',
      scopeUnitId: COLLECTOR_UNIT,
    });
    const { app } = makeApp({ users: [collector, warehouse, scoped], units, items });
    const body = JSON.stringify({
      warehouseUnitId: WAREHOUSE_UNIT,
      lines: [{ itemId: ITEM_A, qty: '1', unitCost: '1.00' }],
    });

    const forbiddenRole = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('collector'),
      body,
    });
    expect(forbiddenRole.status).toBe(403);

    const forbiddenScope = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse-scoped'),
      body,
    });
    expect(forbiddenScope.status).toBe(403);
    expect(await forbiddenScope.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('删除 DRAFT 入库单成功，随后 GET 404', async () => {
    const { app } = makeApp({ users: [warehouse], units, items });
    const created = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        lines: [{ itemId: ITEM_A, qty: '5', unitCost: '2.50' }],
      }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const del = await app.request(`/api/v1/inbound-orders/${id}`, {
      method: 'DELETE',
      headers: auth('warehouse'),
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ data: { id } });

    const get = await app.request(`/api/v1/inbound-orders/${id}`, { headers: auth('warehouse') });
    expect(get.status).toBe(404);
  });

  it('非 DRAFT（POSTED）入库单删除返回 409 INBOUND_STATE_CONFLICT', async () => {
    const { app } = makeApp({ users: [warehouse], units, items });
    const created = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        lines: [{ itemId: ITEM_A, qty: '5', unitCost: '2.50' }],
      }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    await app.request(`/api/v1/inbound-orders/${id}/post`, {
      method: 'POST',
      headers: json('warehouse'),
    });

    const del = await app.request(`/api/v1/inbound-orders/${id}`, {
      method: 'DELETE',
      headers: auth('warehouse'),
    });
    expect(del.status).toBe(409);
    expect(await del.json()).toMatchObject({ error: { code: 'INBOUND_STATE_CONFLICT' } });
  });

  it('无 INBOUND_CONFIRM 权限（COLLECTOR）删除入库单返回 403', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const created = await app.request('/api/v1/inbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        lines: [{ itemId: ITEM_A, qty: '1', unitCost: '1.00' }],
      }),
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const del = await app.request(`/api/v1/inbound-orders/${id}`, {
      method: 'DELETE',
      headers: auth('collector'),
    });
    expect(del.status).toBe(403);
  });

  it('删除不存在的入库单返回 404', async () => {
    const { app } = makeApp({ users: [warehouse], units, items });
    const del = await app.request('/api/v1/inbound-orders/00000000-0000-4000-8000-0000000000ff', {
      method: 'DELETE',
      headers: auth('warehouse'),
    });
    expect(del.status).toBe(404);
  });
});
