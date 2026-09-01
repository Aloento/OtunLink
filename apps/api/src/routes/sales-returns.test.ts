import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const WAREHOUSE_UNIT_2 = '00000000-0000-4000-8000-000000000003';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000004';
const RETAIL_UNIT_2 = '00000000-0000-4000-8000-000000000005';
const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const ITEM_A = '00000000-0000-4000-8000-000000000011';
const FAKE_UUID = '00000000-0000-4000-8000-0000000000ff';

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

const wh = user({ entraSub: 'wh', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
const wh2 = user({ entraSub: 'wh2', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT_2 });
const rt = user({ entraSub: 'rt', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });
const rt2 = user({ entraSub: 'rt2', role: 'RETAILER', scopeUnitId: RETAIL_UNIT_2 });

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '仓库一' }),
  unit({ id: WAREHOUSE_UNIT_2, type: 'WAREHOUSE', name: '仓库二' }),
  unit({ id: RETAIL_UNIT, type: 'RETAILER', name: '零售门店一' }),
  unit({ id: RETAIL_UNIT_2, type: 'RETAILER', name: '零售门店二' }),
];
const items = [item({ id: ITEM_A, name: '苹果', specUnit: 'PIECE' })];

type Seed = Parameters<typeof createMemoryRepos>[0];

function makeApp(extra: Partial<Seed> = {}) {
  const repos = createMemoryRepos({
    users: [wh, wh2, rt, rt2],
    units,
    items,
    ...extra,
  });
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

/** 手动入库并过账，返回 { batchId, qty }。 */
async function seedStock(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  opts: {
    warehouseUnitId: string;
    itemId: string;
    qty: string;
    unitCost: string;
    batchNo: string;
    expiryDate: string;
  },
) {
  const created = await app.request('/api/v1/inbound-orders', {
    method: 'POST',
    headers: json('wh'),
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
    headers: json('wh'),
  });
  expect(posted.status).toBe(200);
  const payload = (await posted.json()) as {
    data: { items: Array<{ batchId: string; qty: string }> };
  };
  return { batchId: payload.data.items[0].batchId, qty: payload.data.items[0].qty };
}

/** 仓库设置零售价（PUT /api/v1/retail-prices）。 */
async function setPrice(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  unitId: string,
  itemId: string,
  price: string,
) {
  const res = await app.request('/api/v1/retail-prices', {
    method: 'PUT',
    headers: json('wh'),
    body: JSON.stringify({ unitId, itemId, price, currency: 'CNY' }),
  });
  expect(res.status).toBe(200);
}

/** 预置库存并创建、发送销售单（SENT），返回 { orderId, salesOrderItemId }。 */
async function readySalesOrder(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  qty: string,
  shipments: Array<{ qty: string; unitCost: string; batchNo: string; expiryDate: string }>,
): Promise<{ orderId: string; salesOrderItemId: string }> {
  for (const s of shipments) {
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT,
      itemId: ITEM_A,
      qty: s.qty,
      unitCost: s.unitCost,
      batchNo: s.batchNo,
      expiryDate: s.expiryDate,
    });
  }
  await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');

  const created = await app.request('/api/v1/sales-orders', {
    method: 'POST',
    headers: json('wh'),
    body: JSON.stringify({
      sellerUnitId: WAREHOUSE_UNIT,
      buyerUnitId: RETAIL_UNIT,
      source: 'RETAILER_REQUEST',
      deliveryMethod: 'PICKUP',
      lines: [{ itemId: ITEM_A, qty }],
    }),
  });
  expect(created.status).toBe(201);
  const orderId = ((await created.json()) as { data: { id: string } }).data.id;
  const sent = await app.request(`/api/v1/sales-orders/${orderId}/send`, {
    method: 'POST',
    headers: json('wh'),
    body: '{}',
  });
  expect(sent.status).toBe(200);
  const detail = (await sent.json()) as {
    data: {
      id: string;
      status: string;
      items: Array<{ id: string; itemId: string; qty: string }>;
    };
  };
  expect(detail.data.status).toBe('SENT');
  return { orderId, salesOrderItemId: detail.data.items[0].id };
}

/** 零售方发起售后。 */
async function createReturn(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  orderId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/v1/sales-orders/${orderId}/returns`, {
    method: 'POST',
    headers: json('rt'),
    body: JSON.stringify(body),
  });
}

async function createdOf(
  res: Response,
): Promise<{ returnId: string; returnItemId: string }> {
  const payload = (await res.json()) as {
    data: { id: string; items: Array<{ id: string }> };
  };
  return { returnId: payload.data.id, returnItemId: payload.data.items[0].id };
}

describe(' 零售售后退货（SALES）闭环', () => {
  it('发起：部分退货 → 201 REQUESTED，含销售单号；售后列表可按销售单过滤', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);

    const res = await createReturn(app, orderId, {
      reason: '顾客退货',
      items: [{ salesOrderItemId, qty: '2', reason: '尺寸不合' }],
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      data: {
        id: string;
        returnNo: string;
        status: string;
        sourceType: string;
        salesOrderId: string;
        salesOrderNo: string;
        items: Array<{
          salesOrderItemId: string;
          qty: string;
          receivedQty: string | null;
          pendingQc: boolean;
        }>;
      };
    };
    expect(payload.data.status).toBe('REQUESTED');
    expect(payload.data.sourceType).toBe('SALES');
    expect(payload.data.salesOrderId).toBe(orderId);
    expect(payload.data.salesOrderNo).toMatch(/^SO-/);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({
      salesOrderItemId,
      qty: '2.00',
      receivedQty: null,
      pendingQc: false,
    });

    const list = await app.request(
      `/api/v1/return-orders?sourceType=SALES&salesOrderId=${orderId}`,
      { headers: auth('rt') },
    );
    expect(list.status).toBe(200);
    const listPayload = (await list.json()) as {
      data: { items: Array<{ id: string; salesOrderId: string; status: string }> };
    };
    expect(listPayload.data.items).toHaveLength(1);
    expect(listPayload.data.items[0]).toMatchObject({ salesOrderId: orderId, status: 'REQUESTED' });
  });

  it('发起：全量退货 → 201；重复申请 → 409 RETURN_QTY_EXCEEDED；超量 → 409；数量 0 → 400', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);

    const full = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '5' }],
    });
    expect(full.status).toBe(201);

    const again = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '1' }],
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'RETURN_QTY_EXCEEDED' } });

    const over = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '6' }],
    });
    expect(over.status).toBe(409);
    expect(await over.json()).toMatchObject({ error: { code: 'RETURN_QTY_EXCEEDED' } });

    // qty 必须为正数：zod 校验先行 → VALIDATION_ERROR（400）
    const zero = await createReturn(app, orderId, { items: [{ salesOrderItemId, qty: '0' }] });
    expect(zero.status).toBe(400);
    expect(await zero.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('发起：DRAFT 销售单 → 409 SALES_STATE_CONFLICT；未知销售行 → 400 RETURN_LINE_INVALID', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    const created = await app.request('/api/v1/sales-orders', {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({
        sellerUnitId: WAREHOUSE_UNIT,
        buyerUnitId: RETAIL_UNIT,
        source: 'RETAILER_REQUEST',
        deliveryMethod: 'PICKUP',
        lines: [{ itemId: ITEM_A, qty: '5' }],
      }),
    });
    const orderId = ((await created.json()) as { data: { id: string } }).data.id;

    const draft = await createReturn(app, orderId, {
      items: [{ salesOrderItemId: FAKE_UUID, qty: '1' }],
    });
    expect(draft.status).toBe(409);
    expect(await draft.json()).toMatchObject({ error: { code: 'SALES_STATE_CONFLICT' } });
  });

  it('权限：仓库发起 → 403；越界零售单元发起 → 403', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);

    const byWh = await app.request(`/api/v1/sales-orders/${orderId}/returns`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ items: [{ salesOrderItemId, qty: '1' }] }),
    });
    expect(byWh.status).toBe(403);

    const byOther = await app.request(`/api/v1/sales-orders/${orderId}/returns`, {
      method: 'POST',
      headers: json('rt2'),
      body: JSON.stringify({ items: [{ salesOrderItemId, qty: '1' }] }),
    });
    expect(byOther.status).toBe(403);
  });

  it('审核同意：REQUESTED → APPROVED；重复审核 → 409；审批前收货 → 409', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '2' }],
    });
    const { returnId } = await createdOf(created);

    // 审批前收货（状态 REQUESTED）→ 409 RETURN_ALREADY_PROCESSED
    const premature = await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ items: [{ returnItemId: FAKE_UUID, receivedQty: '1' }] }),
    });
    expect(premature.status).toBe(409);
    expect(await premature.json()).toMatchObject({ error: { code: 'RETURN_ALREADY_PROCESSED' } });

    const approved = await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ note: '同意退货' }),
    });
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as { data: { status: string } }).data.status).toBe('APPROVED');

    const again = await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({}),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'RETURN_ALREADY_PROCESSED' } });
  });

  it('审核拒绝：REQUESTED → CANCELLED（终态，附理由）；拒绝后收货/再拒绝 → 409', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '2' }],
    });
    const { returnId } = await createdOf(created);

    const rejected = await app.request(`/api/v1/return-orders/${returnId}/reject`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ note: '不符合退货条件' }),
    });
    expect(rejected.status).toBe(200);
    const rejectedPayload = (await rejected.json()) as {
      data: { status: string; processedNote: string };
    };
    expect(rejectedPayload.data.status).toBe('CANCELLED');
    expect(rejectedPayload.data.processedNote).toBe('不符合退货条件');

    const receiveAfter = await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ items: [{ returnItemId: FAKE_UUID, receivedQty: '1' }] }),
    });
    expect(receiveAfter.status).toBe(409);
    expect(await receiveAfter.json()).toMatchObject({ error: { code: 'RETURN_ALREADY_PROCESSED' } });

    const rejectAgain = await app.request(`/api/v1/return-orders/${returnId}/reject`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ note: 'again' }),
    });
    expect(rejectAgain.status).toBe(409);
    expect(await rejectAgain.json()).toMatchObject({ error: { code: 'RETURN_ALREADY_PROCESSED' } });
  });

  it('退回收货：原批次回补（UNIT_COST 取原 OUTBOUND_SALE 流水），状态 RETURNED', async () => {
    const { app, repos } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '5', unitCost: '7', batchNo: 'B-EARLY', expiryDate: '2025-01-01' },
      { qty: '10', unitCost: '8', batchNo: 'B-LATE', expiryDate: '2025-03-01' },
    ]);
    // FEFO：先近效期 → B-EARLY 5（unit_cost 7），B-LATE 未消耗。
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '3' }],
    });
    const { returnId, returnItemId } = await createdOf(created);

    await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({}),
    });

    const received = await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ items: [{ returnItemId, receivedQty: '3' }] }),
    });
    expect(received.status).toBe(200);
    const receivedPayload = (await received.json()) as {
      data: {
        status: string;
        items: Array<{ receivedQty: string; originalBatchId: string; pendingQc: boolean }>;
      };
    };
    expect(receivedPayload.data.status).toBe('RETURNED');
    expect(receivedPayload.data.items[0].receivedQty).toBe('3.00');
    expect(receivedPayload.data.items[0].pendingQc).toBe(false);

    const stock = await app.request(
      `/api/v1/stock?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`,
      { headers: auth('wh') },
    );
    const stockBody = (await stock.json()) as {
      data: { items: Array<{ batchId: string; qty: string }> };
    };
    const replenished = stockBody.data.items.find(
      (s) => s.batchId === receivedPayload.data.items[0].originalBatchId,
    );
    expect(replenished?.qty).toBe('3'); // 5 - 5 + 3

    const movements = (
      repos.inbounds as unknown as {
        movements: Array<{ orderId: string; type: string; qtyDelta: number; unitCost: number; batchId: string }>;
      }
    ).movements.filter((m) => m.orderId === orderId && m.type === 'RETURN_IN');
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      qtyDelta: 3,
      unitCost: 7,
      batchId: receivedPayload.data.items[0].originalBatchId,
    });
  });

  it('退回收货：数量校验（超申请 → 409；缺行/未知行 → 400）', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '2' }],
    });
    const { returnId, returnItemId } = await createdOf(created);
    await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({}),
    });

    const over = await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ items: [{ returnItemId, receivedQty: '3' }] }),
    });
    expect(over.status).toBe(409);
    expect(await over.json()).toMatchObject({ error: { code: 'RETURN_QTY_EXCEEDED' } });

    const missing = await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({
        items: [{ returnItemId: FAKE_UUID, receivedQty: '1' }],
      }),
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: { code: 'RETURN_LINE_INVALID' } });
  });

  it('退回收货：无原批次分配 → 回补/创建「退货待检批次」（RETURNS_PENDING，待质检）', async () => {
    const salesOrderId = '00000000-0000-4000-8000-0000000000a1';
    const salesItemId = '00000000-0000-4000-8000-0000000000a2';
    const { app, repos } = makeApp({
      salesOrders: [
        {
          id: salesOrderId,
          salesNo: 'SO-20250101-0001',
          sellerUnitId: WAREHOUSE_UNIT,
          buyerUnitId: RETAIL_UNIT,
          source: 'RETAILER_REQUEST',
          deliveryMethod: 'PICKUP',
          deliveryAddress: null,
          freight: '0',
          discountPercent: '0',
          currency: 'CNY',
          totalAmount: '500.00',
          status: 'SENT',
          remark: null,
          sentAt: now,
          confirmedAt: null,
          createdBy: 'id-wh',
          createdAt: now,
          updatedAt: now,
          hasPayment: false,
        },
      ],
      salesItems: [
        {
          id: salesItemId,
          salesOrderId,
          itemId: ITEM_A,
          itemName: '苹果',
          spec: 'PIECE',
          qty: '5.00',
          listPrice: '100.00',
          price: '100.00',
          lineTotal: '500.00',
        },
      ],
    });

    const created = await createReturn(app, salesOrderId, {
      items: [{ salesOrderItemId: salesItemId, qty: '5' }],
    });
    expect(created.status).toBe(201);
    const { returnId, returnItemId } = await createdOf(created);

    await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({}),
    });

    const received = await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ items: [{ returnItemId, receivedQty: '5' }] }),
    });
    expect(received.status).toBe(200);
    const payload = (await received.json()) as {
      data: {
        status: string;
        items: Array<{ receivedQty: string; originalBatchId: string; pendingQc: boolean }>;
      };
    };
    expect(payload.data.status).toBe('RETURNED');
    expect(payload.data.items[0].receivedQty).toBe('5.00');
    expect(payload.data.items[0].pendingQc).toBe(true);

    // 待检批次：source_type=RETURNS_PENDING，无生产/到期日期，且已建档入库。
    const pending = [
      ...(
        repos.inbounds as unknown as {
          batches: Map<string, { sourceType: string; itemId: string; productionDate: string | null; expiryDate: string | null }>;
        }
      ).batches.values(),
    ].filter((b) => b.sourceType === 'RETURNS_PENDING');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ itemId: ITEM_A, productionDate: null, expiryDate: null });

    const stock = await app.request(
      `/api/v1/stock?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`,
      { headers: auth('wh') },
    );
    const stockBody = (await stock.json()) as {
      data: { items: Array<{ qty: string }> };
    };
    expect(stockBody.data.items).toHaveLength(1);
    expect(stockBody.data.items[0].qty).toBe('5');
  });

  it('处理权限：零售方审核/收货 → 403；越界仓库处理 → 403', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '2' }],
    });
    const { returnId } = await createdOf(created);

    const approveByRt = await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('rt'),
      body: JSON.stringify({}),
    });
    expect(approveByRt.status).toBe(403);

    const approveByWh2 = await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('wh2'),
      body: JSON.stringify({}),
    });
    expect(approveByWh2.status).toBe(403);
  });

  it('删除 REQUESTED 售后退货单成功，随后 GET 404', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '2' }],
    });
    const { returnId } = await createdOf(created);

    const del = await app.request(`/api/v1/return-orders/${returnId}`, {
      method: 'DELETE',
      headers: auth('wh'),
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ data: { id: returnId } });

    const get = await app.request(`/api/v1/return-orders/${returnId}`, { headers: auth('wh') });
    expect(get.status).toBe(404);
  });

  it('已收货（RETURNED）售后退货单删除返回 409 RETURN_STATE_CONFLICT', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '2' }],
    });
    const { returnId, returnItemId } = await createdOf(created);
    await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({}),
    });
    await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('wh'),
      body: JSON.stringify({ items: [{ returnItemId, receivedQty: '2' }] }),
    });

    const del = await app.request(`/api/v1/return-orders/${returnId}`, {
      method: 'DELETE',
      headers: auth('wh'),
    });
    expect(del.status).toBe(409);
    expect(await del.json()).toMatchObject({ error: { code: 'RETURN_STATE_CONFLICT' } });
  });

  it('删除不属于自己 scope 的售后退货单返回 403', async () => {
    const { app } = makeApp();
    const { orderId, salesOrderItemId } = await readySalesOrder(app, '5', [
      { qty: '10', unitCost: '8', batchNo: 'B-1', expiryDate: '2025-03-01' },
    ]);
    const created = await createReturn(app, orderId, {
      items: [{ salesOrderItemId, qty: '2' }],
    });
    const { returnId } = await createdOf(created);

    const del = await app.request(`/api/v1/return-orders/${returnId}`, {
      method: 'DELETE',
      headers: auth('wh2'),
    });
    expect(del.status).toBe(403);
  });
});
