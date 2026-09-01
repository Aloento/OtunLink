import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

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

describe(' 发货退货（拒收）闭环', () => {
  async function readyShipment(
    app: Awaited<ReturnType<typeof makeApp>>['app'],
    expectedQty = 5,
  ): Promise<{ shipmentId: string; itemId: string }> {
    const created = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({
        shipperUnitId: COLLECTOR_UNIT,
        receiverUnitId: WAREHOUSE_UNIT,
        boxesCount: 1,
        trackings: [{ carrier: 'SF', trackingNo: 'SF123' }],
        currency: 'CNY',
        items: [{ itemId: ITEM_A, expectedQty, unitPrice: '3.00' }],
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
    const detail = await app.request(`/api/v1/shipments/${shipmentId}`, { headers: auth('warehouse') });
    const detailPayload = (await detail.json()) as { data: { items: Array<{ id: string }> } };
    const itemId = detailPayload.data.items[0].id;
    const counted = await app.request(`/api/v1/shipments/${shipmentId}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        version: 0,
        items: [{ shipmentItemId: itemId, actualQty: String(expectedQty) }],
      }),
    });
    expect(counted.status).toBe(200);
    return { shipmentId, itemId };
  }

  it('发起退货：READY → RETURN_PENDING，退货单 PENDING', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const res = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        reason: '外箱破损',
        items: [{ shipmentItemId: itemId, qty: '2', reason: '破损' }],
      }),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { data: { id: string; status: string; items: Array<{ qty: string }> } };
    expect(payload.data.status).toBe('PENDING');
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0].qty).toBe('2.00');

    const shipmentDetail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    const shipmentPayload = (await shipmentDetail.json()) as { data: { status: string } };
    expect(shipmentPayload.data.status).toBe('RETURN_PENDING');
  });

  it('非 READY 发起退货 → 409 RETURN_STATE_CONFLICT', async () => {
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
        items: [{ itemId: ITEM_A, expectedQty: 5, unitPrice: '3.00' }],
      }),
    });
    const shipmentId = ((await created.json()) as { data: { id: string } }).data.id;

    const res = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: '00000000-0000-4000-8000-0000000000ff', qty: '1' }] }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'RETURN_STATE_CONFLICT' } });
  });

  it('退货行数量超应收 → 400 RETURN_LINE_INVALID', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const res = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, qty: '99' }] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'RETURN_LINE_INVALID' } });
  });

  it('发起退货权限：集货方 → 403；处理权限：仓库 → 403', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const createByCollector = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, qty: '1' }] }),
    });
    expect(createByCollector.status).toBe(403);

    const created = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, qty: '1' }] }),
    });
    const returnId = ((await created.json()) as { data: { id: string } }).data.id;

    const acceptByWarehouse = await app.request(`/api/v1/return-orders/${returnId}/accept`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({}),
    });
    expect(acceptByWarehouse.status).toBe(403);
  });

  it('接受退货（全部拒收）：发货单 RETURNED，退货单 CLOSED', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const created = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, qty: '5' }] }),
    });
    const returnId = ((await created.json()) as { data: { id: string } }).data.id;

    const accepted = await app.request(`/api/v1/return-orders/${returnId}/accept`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ note: '同意退货' }),
    });
    expect(accepted.status).toBe(200);
    expect(((await accepted.json()) as { data: { status: string } }).data.status).toBe('CLOSED');

    const shipmentDetail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    const shipmentPayload = (await shipmentDetail.json()) as { data: { status: string } };
    expect(shipmentPayload.data.status).toBe('RETURNED');
  });

  it('接受退货（部分拒收）：剩余自动建档 DRAFT 入库单，发货单 INBOUNDED', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const created = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, qty: '2' }] }),
    });
    const returnId = ((await created.json()) as { data: { id: string } }).data.id;

    const accepted = await app.request(`/api/v1/return-orders/${returnId}/accept`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ note: '部分拒收，剩余入库' }),
    });
    expect(accepted.status).toBe(200);

    const shipmentDetail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    const shipmentPayload = (await shipmentDetail.json()) as { data: { status: string } };
    expect(shipmentPayload.data.status).toBe('INBOUNDED');

    const inboundList = await app.request('/api/v1/inbound-orders', { headers: auth('warehouse') });
    const inboundPayload = (await inboundList.json()) as {
      data: { items: Array<{ id: string; status: string }> };
    };
    expect(inboundPayload.data.items).toHaveLength(1);
    const inboundId = inboundPayload.data.items[0].id;

    const inboundDetail = await app.request(`/api/v1/inbound-orders/${inboundId}`, {
      headers: auth('warehouse'),
    });
    const detailPayload = (await inboundDetail.json()) as {
      data: { status: string; items: Array<{ qty: string }> };
    };
    expect(detailPayload.data.status).toBe('DRAFT');
    expect(detailPayload.data.items[0].qty).toBe('3.00');
  });

  it('拒绝退货：发货单 → READY，退货单 REJECTED', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const created = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, qty: '2' }] }),
    });
    const returnId = ((await created.json()) as { data: { id: string } }).data.id;

    const rejected = await app.request(`/api/v1/return-orders/${returnId}/reject`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ note: '数量不符，请重新发起' }),
    });
    expect(rejected.status).toBe(200);
    expect(((await rejected.json()) as { data: { status: string } }).data.status).toBe('REJECTED');

    const shipmentDetail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    const shipmentPayload = (await shipmentDetail.json()) as { data: { status: string } };
    expect(shipmentPayload.data.status).toBe('READY');
  });

  it('重复处理退货单 → 409 RETURN_ALREADY_PROCESSED', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, itemId } = await readyShipment(app);

    const created = await app.request(`/api/v1/shipments/${shipmentId}/returns`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, qty: '2' }] }),
    });
    const returnId = ((await created.json()) as { data: { id: string } }).data.id;

    await app.request(`/api/v1/return-orders/${returnId}/accept`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({}),
    });

    const again = await app.request(`/api/v1/return-orders/${returnId}/reject`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ note: '重复处理' }),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'RETURN_ALREADY_PROCESSED' } });
  });
});
