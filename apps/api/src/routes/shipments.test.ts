import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const OTHER_COLLECTOR = '00000000-0000-4000-8000-000000000003';
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

const collector = user({ entraSub: 'collector', role: 'COLLECTOR' });
const collectorScoped = user({
  entraSub: 'collector-scoped',
  role: 'COLLECTOR',
  scopeUnitId: COLLECTOR_UNIT,
});
const warehouse = user({ entraSub: 'warehouse', role: 'WAREHOUSE' });
const retailer = user({ entraSub: 'retailer', role: 'RETAILER' });

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
    const { app } = makeApp({ users: [collector, collectorScoped], units, items });

    await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
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
