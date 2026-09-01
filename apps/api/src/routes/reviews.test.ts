import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const OTHER_COLLECTOR = '00000000-0000-4000-8000-000000000003';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000005';
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

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '匈牙利仓库' }),
  unit({ id: OTHER_COLLECTOR, type: 'COLLECTOR', name: '广州集货部' }),
];

const items = [item({ id: ITEM_A, name: '苹果', specUnit: 'PIECE', isPerishable: false })];

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
    trackings: [{ carrier: 'SF', trackingNo: 'SF123456', note: null }],
    items: [{ itemId: ITEM_A, expectedQty: 5, unitPrice: '1.50' }],
    ...overrides,
  };
}

describe('差异修订审批 API (ck-06)', () => {
  let seq = 0;

  async function setupDiscrepancy(
    app: Awaited<ReturnType<typeof makeApp>>['app'],
  ): Promise<{ shipmentId: string; reviewId: string }> {
    seq += 1;
    const created = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify(
        body({ trackings: [{ carrier: 'SF', trackingNo: `RV${seq}`, note: null }] }),
      ),
    });
    expect(created.status).toBe(201);
    const createdPayload = (await created.json()) as { data: { id: string } };
    const shipmentId = createdPayload.data.id;

    const sent = await app.request(`/api/v1/shipments/${shipmentId}/send`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(sent.status).toBe(200);

    const started = await app.request(`/api/v1/shipments/${shipmentId}/start-counting`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(started.status).toBe(200);

    const detail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    const detailPayload = (await detail.json()) as { data: { items: Array<{ id: string }> } };
    const itemId = detailPayload.data.items[0].id;

    const counted = await app.request(`/api/v1/shipments/${shipmentId}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ version: 0, items: [{ shipmentItemId: itemId, actualQty: '3' }] }),
    });
    expect(counted.status).toBe(200);

    const submitted = await app.request(`/api/v1/shipments/${shipmentId}/reviews`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        items: [{ shipmentItemId: itemId, reason: '运输破损 2 个' }],
        reason: '到货破损',
      }),
    });
    expect(submitted.status).toBe(201);
    const submittedPayload = (await submitted.json()) as { data: { id: string } };
    return { shipmentId, reviewId: submittedPayload.data.id };
  }

  it('同意修订：应收 := 实收（审计），发货单 → READY', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, reviewId } = await setupDiscrepancy(app);

    const approved = await app.request(`/api/v1/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(approved.status).toBe(200);
    const approvedPayload = (await approved.json()) as {
      data: { status: string; reviewedBy: string | null };
    };
    expect(approvedPayload.data.status).toBe('APPROVED');
    expect(approvedPayload.data.reviewedBy).toBe('id-collector');

    const detail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('collector'),
    });
    const detailPayload = (await detail.json()) as {
      data: { status: string; items: Array<{ expectedQty: string; actualQty: string }> };
    };
    expect(detailPayload.data.status).toBe('READY');
    expect(detailPayload.data.items[0]).toMatchObject({ expectedQty: '3', actualQty: '3' });
  });

  it('重复审批 → 409 REVIEW_ALREADY_PROCESSED', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { reviewId } = await setupDiscrepancy(app);

    const first = await app.request(`/api/v1/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(first.status).toBe(200);

    const second = await app.request(`/api/v1/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: { code: 'REVIEW_ALREADY_PROCESSED' } });
  });

  it('拒绝修订：发货单回到 DISCREPANCY，可修改实收后重提并再次审批', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { shipmentId, reviewId } = await setupDiscrepancy(app);

    const rejected = await app.request(`/api/v1/reviews/${reviewId}/reject`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ reason: '请重新核对' }),
    });
    expect(rejected.status).toBe(200);
    const rejectedPayload = (await rejected.json()) as {
      data: { status: string; reason: string };
    };
    expect(rejectedPayload.data.status).toBe('REJECTED');
    expect(rejectedPayload.data.reason).toBe('请重新核对');

    let detail = await app.request(`/api/v1/shipments/${shipmentId}`, {
      headers: auth('warehouse'),
    });
    let detailPayload = (await detail.json()) as {
      data: { status: string; items: Array<{ id: string; expectedQty: string }> };
    };
    expect(detailPayload.data.status).toBe('DISCREPANCY');
    expect(detailPayload.data.items[0].expectedQty).toBe('5');

    // 仓库修改实收（版本号仍为 1）并重提。
    const itemId = detailPayload.data.items[0].id;
    const recounted = await app.request(`/api/v1/shipments/${shipmentId}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ version: 1, items: [{ shipmentItemId: itemId, actualQty: '4' }] }),
    });
    expect(recounted.status).toBe(200);

    const resubmitted = await app.request(`/api/v1/shipments/${shipmentId}/reviews`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId: itemId, reason: '复核后差 1' }] }),
    });
    expect(resubmitted.status).toBe(201);
    const resubmittedPayload = (await resubmitted.json()) as { data: { id: string } };

    const approved = await app.request(`/api/v1/reviews/${resubmittedPayload.data.id}/approve`, {
      method: 'POST',
      headers: json('collector'),
    });
    expect(approved.status).toBe(200);

    detail = await app.request(`/api/v1/shipments/${shipmentId}`, { headers: auth('warehouse') });
    detailPayload = (await detail.json()) as {
      data: { status: string; items: Array<{ id: string; expectedQty: string }> };
    };
    expect(detailPayload.data.status).toBe('READY');
    expect(detailPayload.data.items[0].expectedQty).toBe('4');
  });

  it('拒绝理由必填 → 400 VALIDATION_ERROR', async () => {
    const { app } = makeApp({ users: [collector, warehouse], units, items });
    const { reviewId } = await setupDiscrepancy(app);

    const res = await app.request(`/api/v1/reviews/${reviewId}/reject`, {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ reason: '' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('权限：WAREHOUSE/RETAILER 审批 403', async () => {
    const { app } = makeApp({ users: [collector, warehouse, retailer], units, items });
    const { reviewId } = await setupDiscrepancy(app);

    const byWarehouse = await app.request(`/api/v1/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: json('warehouse'),
    });
    expect(byWarehouse.status).toBe(403);

    const byRetailer = await app.request(`/api/v1/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: json('retailer'),
    });
    expect(byRetailer.status).toBe(403);
  });

  it('数据范围：非发货方集货 scoped 审批 403，发货方 scoped 200', async () => {
    const { app } = makeApp(
      { users: [collector, collectorScoped, collectorOtherScoped, warehouse], units, items },
    );
    const { reviewId } = await setupDiscrepancy(app);

    const cross = await app.request(`/api/v1/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: json('collector-other'),
    });
    expect(cross.status).toBe(403);

    const own = await app.request(`/api/v1/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: json('collector-scoped'),
    });
    expect(own.status).toBe(200);
  });

  it('修订不存在 → 404', async () => {
    const { app } = makeApp({ users: [collector], units, items });
    const res = await app.request(
      '/api/v1/reviews/00000000-0000-4000-8000-0000000000ff/approve',
      { method: 'POST', headers: json('collector') },
    );
    expect(res.status).toBe(404);
  });
});
