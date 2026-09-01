import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const OTHER_COLLECTOR = '00000000-0000-4000-8000-000000000003';
const OTHER_WAREHOUSE = '00000000-0000-4000-8000-000000000004';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000005';
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
const collectorScoped = user({
  entraSub: 'collector-scoped',
  role: 'COLLECTOR',
  scopeUnitId: COLLECTOR_UNIT,
});
const collectorOtherScoped = user({
  entraSub: 'collector-other',
  role: 'COLLECTOR',
  scopeUnitId: OTHER_COLLECTOR,
});
const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
const retailer = user({ entraSub: 'retailer', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });

function makeApp(
  seed: {
    users?: UserRecord[];
    units?: UnitRecord[];
    items?: ItemRecord[];
  } = {},
) {
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

function body(overrides: Record<string, unknown> = {}) {
  return {
    shipperUnitId: COLLECTOR_UNIT,
    receiverUnitId: WAREHOUSE_UNIT,
    boxesCount: 3,
    currency: 'CNY',
    expectedArrivalDate: '2025-02-01',
    remark: '测试发货',
    trackings: [
      { carrier: 'SF', trackingNo: 'SF123456', note: null },
      { carrier: 'DHL', trackingNo: 'DHL789', note: '空运' },
    ],
    items: [{ itemId: ITEM_A, expectedQty: 5, unitPrice: '1.50' }],
    ...overrides,
  };
}

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '匈牙利仓库' }),
  unit({ id: OTHER_COLLECTOR, type: 'COLLECTOR', name: '广州集货部' }),
  unit({ id: OTHER_WAREHOUSE, type: 'WAREHOUSE', name: '奥地利仓库' }),
];

const items = [
  item({ id: ITEM_A, name: '苹果', specUnit: 'PIECE', isPerishable: false }),
  item({ id: ITEM_B, name: '鲜牛奶', specUnit: 'BAG', isPerishable: true }),
];

describe('shipments 发货单 API', () => {
  it('未登录访问 /shipments 返回 401', async () => {
    const { app } = makeApp({});
    const res = await app.request('/api/v1/shipments');
    expect(res.status).toBe(401);
  });

  it('非 ADMIN 空 scope 访问 /shipments 返回 403', async () => {
    const warehouseNoScope = user({ entraSub: 'warehouse-noscope', role: 'WAREHOUSE' });
    const { app } = makeApp({ users: [warehouseNoScope], units, items });
    const res = await app.request('/api/v1/shipments', { headers: auth('warehouse-noscope') });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('创建发货单：多物流单号、快照与编号', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: {
        shipmentNo: string;
        status: string;
        boxesCount: number;
        shipperName: string;
        receiverName: string;
        trackings: Array<{ carrier: string; trackingNo: string }>;
        items: Array<{ itemId: string; name: string; spec: string; expectedQty: string }>;
      };
    };
    expect(payload.data.shipmentNo).toMatch(/^SH-\d{8}-\d{4}$/);
    expect(payload.data.status).toBe('DRAFT');
    expect(payload.data.boxesCount).toBe(3);
    expect(payload.data.shipperName).toBe('上海集货部');
    expect(payload.data.receiverName).toBe('匈牙利仓库');
    expect(payload.data.trackings).toHaveLength(2);
    expect(payload.data.trackings.map((t) => t.carrier)).toContain('SF');
    expect(payload.data.trackings.map((t) => t.carrier)).toContain('DHL');
    // 快照：名称/规格在创建时复制自物品目录。
    expect(payload.data.items[0]).toMatchObject({
      itemId: ITEM_A,
      name: '苹果',
      spec: 'PIECE',
      expectedQty: '5',
    });
  });

  it('易腐物品缺效期被拒绝（400）', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(body({ items: [{ itemId: ITEM_B, expectedQty: 10 }] })),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('易腐物品填写生产日期+到期日可创建（多批拆行）', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(
        body({
          items: [
            { itemId: ITEM_B, expectedQty: 4, productionDate: '2025-01-01', expiryDate: '2025-02-01' },
            { itemId: ITEM_B, expectedQty: 6, productionDate: '2025-01-02', expiryDate: '2025-02-02' },
          ],
        }),
      ),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { data: { items: Array<{ expiryDate: string }> } };
    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items[0].expiryDate).toBe('2025-02-01');
  });

  it('物品不存在返回 400', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(
        body({ items: [{ itemId: '00000000-0000-4000-8000-0000000000ff', expectedQty: 1 }] }),
      ),
    });
    expect(res.status).toBe(400);
  });

  it('收货方非 WAREHOUSE 被拒绝（400）', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(body({ receiverUnitId: OTHER_COLLECTOR })),
    });
    expect(res.status).toBe(400);
  });

  it('物流单号重复返回 409 TRACKING_CONFLICT', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const first = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(body()),
    });
    expect(first.status).toBe(201);

    const res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(
        body({ trackings: [{ carrier: 'SF', trackingNo: 'SF123456', note: null }] }),
      ),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'TRACKING_CONFLICT' } });
  });

  it('转交 send：DRAFT → SENT，重复转交 409', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const created = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(body()),
    });
    const createdPayload = (await created.json()) as { data: { id: string } };
    const id = createdPayload.data.id;

    const sent = await app.request(`/api/v1/shipments/${id}/send`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(sent.status).toBe(200);
    const sentPayload = (await sent.json()) as { data: { status: string; sentAt: string | null } };
    expect(sentPayload.data.status).toBe('SENT');
    expect(sentPayload.data.sentAt).not.toBeNull();

    const again = await app.request(`/api/v1/shipments/${id}/send`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'SHIPMENT_STATE_CONFLICT' } });
  });

  it('SENT 后编辑被拒绝（409），DRAFT 可编辑', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const created = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(body()),
    });
    const createdPayload = (await created.json()) as { data: { id: string } };
    const id = createdPayload.data.id;

    const patchDraft = await app.request(`/api/v1/shipments/${id}`, {
      method: 'PATCH',
      headers: json('collector'),
      body: JSON.stringify({ boxesCount: 5, remark: '改箱数' }),
    });
    expect(patchDraft.status).toBe(200);
    const patched = (await patchDraft.json()) as { data: { boxesCount: number } };
    expect(patched.data.boxesCount).toBe(5);

    await app.request(`/api/v1/shipments/${id}/send`, {
      method: 'POST',
      headers: json('collector'),
    });

    const patchSent = await app.request(`/api/v1/shipments/${id}`, {
      method: 'PATCH',
      headers: json('collector'),
      body: JSON.stringify({ remark: '锁定后改' }),
    });
    expect(patchSent.status).toBe(409);
    expect(await patchSent.json()).toMatchObject({ error: { code: 'SHIPMENT_STATE_CONFLICT' } });
  });

  it('列表与详情：状态过滤、物流单号卡片、清单快照', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(body()),
    });

    const list = await app.request('/api/v1/shipments', { headers: auth('collector') });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      data: { total: number; items: Array<{ id: string; trackings: unknown[]; status: string }> };
    };
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.items[0].trackings).toHaveLength(2);
    expect(listBody.data.items[0].status).toBe('DRAFT');

    const detail = await app.request(`/api/v1/shipments/${listBody.data.items[0].id}`, {
      headers: auth('collector'),
    });
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      data: { items: Array<{ name: string; spec: string }> };
    };
    expect(detailBody.data.items[0]).toMatchObject({ name: '苹果', spec: 'PIECE' });

    const filtered = await app.request('/api/v1/shipments?status=SENT', {
      headers: auth('collector'),
    });
    const filteredBody = (await filtered.json()) as { data: { total: number } };
    expect(filteredBody.data.total).toBe(0);
  });

  it('权限矩阵：RETAILER/WAREHOUSE 创建 403，WAREHOUSE 读 200', async () => {
    const { app } = makeApp({ users: [collector, warehouse, retailer], units, items });

    const retailerCreate = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('retailer'),
      body: JSON.stringify(body()),
    });
    expect(retailerCreate.status).toBe(403);

    const warehouseCreate = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(body()),
    });
    expect(warehouseCreate.status).toBe(403);

    const warehouseRead = await app.request('/api/v1/shipments', { headers: auth('warehouse') });
    expect(warehouseRead.status).toBe(200);

    const warehouseSend = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(body()),
    });
    expect(warehouseSend.status).toBe(403);
  });

  it('数据范围：scope 非空时创建越界 403，列表仅可见本单元', async () => {
    const { app } = makeApp({ users: [collector, collectorScoped, collectorOtherScoped], units, items });

    await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector-other'),
      body: JSON.stringify(body({ shipperUnitId: OTHER_COLLECTOR })),
    });

    // 越界：scoped 用户以其它集货方为发货方创建。
    const crossCreate = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector-scoped'),
      body: JSON.stringify(body({ shipperUnitId: OTHER_COLLECTOR })),
    });
    expect(crossCreate.status).toBe(403);

    // 本单元创建成功。
    const ownCreate = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector-scoped'),
      body: JSON.stringify(body({ trackings: [{ carrier: 'UPS', trackingNo: 'UPS1', note: null }] })),
    });
    expect(ownCreate.status).toBe(201);

    const list = await app.request('/api/v1/shipments', { headers: auth('collector-scoped') });
    const listBody = (await list.json()) as { data: { total: number; items: Array<{ shipperUnitId: string }> } };
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.items[0].shipperUnitId).toBe(COLLECTOR_UNIT);
  });
});

// ── ck-06: 收货点货与差异协商 ────────────────────────────────────────────────

const warehouseScoped = user({
  entraSub: 'warehouse-scoped',
  role: 'WAREHOUSE',
  scopeUnitId: WAREHOUSE_UNIT,
});
const warehouseOtherScoped = user({
  entraSub: 'warehouse-other',
  role: 'WAREHOUSE',
  scopeUnitId: OTHER_WAREHOUSE,
});

describe('shipments 收货点货与差异协商 (ck-06)', () => {
  let seq = 0;
  async function createdShipment(
    app: Awaited<ReturnType<typeof makeApp>>['app'],
    token = 'collector',
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    seq += 1;
    const res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json(token),
      body: JSON.stringify(
        body({
          trackings: [{ carrier: 'SF', trackingNo: `CKT${seq}`, note: null }],
          ...overrides,
        }),
      ),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { data: { id: string } };
    return payload.data.id;
  }

  async function sentShipment(
    app: Awaited<ReturnType<typeof makeApp>>['app'],
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const id = await createdShipment(app, 'collector', overrides);
    const res = await app.request(`/api/v1/shipments/${id}/send`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(res.status).toBe(200);
    return id;
  }

  async function itemIds(app: Awaited<ReturnType<typeof makeApp>>['app'], id: string) {
    const res = await app.request(`/api/v1/shipments/${id}`, { headers: auth('collector') });
    const payload = (await res.json()) as { data: { items: Array<{ id: string }> } };
    return payload.data.items.map((i) => i.id);
  }

  async function startCounting(app: Awaited<ReturnType<typeof makeApp>>['app'], id: string) {
    const res = await app.request(`/api/v1/shipments/${id}/start-counting`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as { data: { status: string } };
  }

  function countBody(version: number, lines: Array<{ shipmentItemId: string; actualQty: string }>) {
    return { version, items: lines };
  }

  it('开始点货：SENT → COUNTING，重复开始 409', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    const started = await startCounting(app, id);
    expect(started.data.status).toBe('COUNTING');

    const again = await app.request(`/api/v1/shipments/${id}/start-counting`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'COUNTING_STATE_CONFLICT' } });
  });

  it('SENT 状态直接保存点货 → 409', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    const [itemId] = await itemIds(app, id);
    const res = await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '5' }])),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'COUNTING_STATE_CONFLICT' } });
  });

  it('点货一致 → READY，版本号递增', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);

    const saved = await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '5' }])),
    });
    expect(saved.status).toBe(200);
    const savedPayload = (await saved.json()) as {
      data: { countVersion: number; shipment: { status: string } };
    };
    expect(savedPayload.data.countVersion).toBe(1);
    expect(savedPayload.data.shipment.status).toBe('READY');

    const detail = await app.request(`/api/v1/shipments/${id}`, { headers: auth('collector') });
    const detailBody = (await detail.json()) as {
      data: { items: Array<{ actualQty: string; expectedQty: string }> };
    };
    expect(detailBody.data.items[0].actualQty).toBe('5');
    expect(detailBody.data.items[0].expectedQty).toBe('5');
  });

  it('点货有差异 → DISCREPANCY 且清单行保留实收', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);

    const saved = await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '3' }])),
    });
    const savedPayload = (await saved.json()) as { data: { shipment: { status: string } } };
    expect(savedPayload.data.shipment.status).toBe('DISCREPANCY');

    const detail = await app.request(`/api/v1/shipments/${id}`, { headers: auth('collector') });
    const detailBody = (await detail.json()) as {
      data: { items: Array<{ actualQty: string; expectedQty: string }> };
    };
    expect(detailBody.data.items[0]).toMatchObject({ expectedQty: '5', actualQty: '3' });
  });

  it('版本冲突：重复使用旧版本保存 → 409 COUNTING_STATE_CONFLICT', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);

    const first = await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '3' }])),
    });
    expect(first.status).toBe(200);

    const second = await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '4' }])),
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: { code: 'COUNTING_STATE_CONFLICT' } });
  });

  it('权限：COLECTOR 点货 403；RETAILER 点货 403', async () => {
    const { app } = makeApp({ users: [collector, warehouse, retailer], units, items });
    const id = await sentShipment(app);
    const [itemId] = await itemIds(app, id);

    const byCollector = await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '5' }])),
    });
    expect(byCollector.status).toBe(403);

    const byRetailer = await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('retailer'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '5' }])),
    });
    expect(byRetailer.status).toBe(403);
  });

  it('数据范围：其他仓库 scoped 开始点货 403，本仓库 scoped 200', async () => {
    const { app } = makeApp(
      { users: [collector, warehouse, warehouseScoped, warehouseOtherScoped], units, items },
    );
    const id = await sentShipment(app);

    const cross = await app.request(`/api/v1/shipments/${id}/start-counting`, {
      method: 'POST',
      headers: json('warehouse-other'),
    });
    expect(cross.status).toBe(403);

    const own = await app.request(`/api/v1/shipments/${id}/start-counting`, {
      method: 'POST',
      headers: json('warehouse-scoped'),
    });
    expect(own.status).toBe(200);
  });

  it('提交差异修订：DISCREPANCY → PENDING，详情含 reviews，重复提交 409', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);
    await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '3' }])),
    });

    const submitted = await app.request(`/api/v1/shipments/${id}/reviews`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        items: [{ shipmentItemId: itemId, reason: '运输破损 2 个' }],
        reason: '到货破损',
      }),
    });
    expect(submitted.status).toBe(201);
    const submittedPayload = (await submitted.json()) as {
      data: {
        status: string;
        shipmentId: string;
        items: Array<{ shipmentItemId: string; actualQty: string; expectedQtyBefore: string; reason: string }>;
      };
    };
    expect(submittedPayload.data.status).toBe('PENDING');
    expect(submittedPayload.data.shipmentId).toBe(id);
    expect(submittedPayload.data.items[0]).toMatchObject({
      shipmentItemId: itemId,
      actualQty: '3',
      expectedQtyBefore: '5',
      reason: '运输破损 2 个',
    });

    const detail = await app.request(`/api/v1/shipments/${id}`, { headers: auth('collector') });
    const detailBody = (await detail.json()) as {
      data: { status: string; reviews: Array<{ status: string }> };
    };
    expect(detailBody.data.status).toBe('REVIEW_PENDING');
    expect(detailBody.data.reviews).toHaveLength(1);
    expect(detailBody.data.reviews[0].status).toBe('PENDING');

    const again = await app.request(`/api/v1/shipments/${id}/reviews`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, reason: '再次提交' }] }),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'REVIEW_ALREADY_PROCESSED' } });
  });

  it('无差异提交修订 → 400 REVIEW_NO_DIFFERENCE', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);
    await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '5' }])),
    });

    const res = await app.request(`/api/v1/shipments/${id}/reviews`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, reason: '无误' }] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'REVIEW_NO_DIFFERENCE' } });
  });

  it('提交修订前未点货 → 400 VALIDATION_ERROR', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);

    const res = await app.request(`/api/v1/shipments/${id}/reviews`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, reason: '未点货' }] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('清单行不属于该发货单 → 400 VALIDATION_ERROR', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);
    await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '3' }])),
    });

    const res = await app.request(`/api/v1/shipments/${id}/reviews`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        items: [{ shipmentItemId: '00000000-0000-4000-8000-0000000000aa', reason: 'x' }],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('提交修订权限：收集方 403', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const id = await sentShipment(app);
    await startCounting(app, id);
    const [itemId] = await itemIds(app, id);
    await app.request(`/api/v1/shipments/${id}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify(countBody(0, [{ shipmentItemId: itemId, actualQty: '3' }])),
    });

    const res = await app.request(`/api/v1/shipments/${id}/reviews`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, reason: 'x' }] }),
    });
    expect(res.status).toBe(403);
  });
});
