import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { ItemRecord, PartnershipRecord, TokenClaims, UnitRecord, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const WAREHOUSE_UNIT_2 = '00000000-0000-4000-8000-000000000003';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000004';
const RETAIL_UNIT_2 = '00000000-0000-4000-8000-000000000005';
const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const ITEM_A = '00000000-0000-4000-8000-000000000011';
const ITEM_B = '00000000-0000-4000-8000-000000000012';
const ITEM_C = '00000000-0000-4000-8000-000000000013';

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

const warehouse = user({ entraSub: 'wh', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT });
const warehouse2 = user({ entraSub: 'wh2', role: 'WAREHOUSE', scopeUnitId: WAREHOUSE_UNIT_2 });
const retailer = user({ entraSub: 'rt', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });
const retailer2 = user({ entraSub: 'rt2', role: 'RETAILER', scopeUnitId: RETAIL_UNIT_2 });
const retailerGlobal = user({ entraSub: 'rtg', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });
const collector = user({ entraSub: 'col', role: 'COLLECTOR', scopeUnitId: COLLECTOR_UNIT });

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '仓库一' }),
  unit({ id: WAREHOUSE_UNIT_2, type: 'WAREHOUSE', name: '仓库二' }),
  unit({ id: RETAIL_UNIT, type: 'RETAILER', name: '零售门店一' }),
  unit({ id: RETAIL_UNIT_2, type: 'RETAILER', name: '零售门店二' }),
];
const items = [
  item({ id: ITEM_A, name: '苹果', specUnit: 'PIECE' }),
  item({ id: ITEM_B, name: '香蕉', specUnit: 'BOX' }),
  item({ id: ITEM_C, name: '橙子', specUnit: 'PIECE' }),
];

function makeApp(extraPartnerships: PartnershipRecord[] = []) {
  // 默认：仓库一与零售门店一（rt/rtg 均绑定 RETAIL_UNIT）已签约；仓库二未与任何零售签约。
  const partnerships: PartnershipRecord[] = [
    {
      id: '00000000-0000-4000-8000-0000000000a1',
      warehouseUnitId: WAREHOUSE_UNIT,
      warehouseUnitName: null,
      retailerUnitId: RETAIL_UNIT,
      retailerUnitName: null,
      createdBy: null,
      createdAt: now,
    },
    ...extraPartnerships,
  ];
  const repos = createMemoryRepos({
    users: [warehouse, warehouse2, retailer, retailer2, retailerGlobal, collector],
    units,
    items,
    partnerships,
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
async function setPrice(app: Awaited<ReturnType<typeof makeApp>>['app'], unitId: string, itemId: string, price: string) {
  const res = await app.request('/api/v1/retail-prices', {
    method: 'PUT',
    headers: json('wh'),
    body: JSON.stringify({ unitId, itemId, price, currency: 'CNY' }),
  });
  expect(res.status).toBe(200);
}

async function createOrder(
  app: Awaited<ReturnType<typeof makeApp>>['app'],
  token: string,
  lines: Array<{ itemId: string; qty: string; unitPriceOverride?: string }>,
  extra: Record<string, unknown> = {},
) {
  const res = await app.request('/api/v1/sales-orders', {
    method: 'POST',
    headers: json(token),
    body: JSON.stringify({
      sellerUnitId: WAREHOUSE_UNIT,
      buyerUnitId: RETAIL_UNIT,
      source: 'RETAILER_REQUEST',
      deliveryMethod: 'PICKUP',
      lines,
      ...extra,
    }),
  });
  return res;
}

async function getOrder(app: Awaited<ReturnType<typeof makeApp>>['app'], id: string, token = 'wh') {
  const res = await app.request(`/api/v1/sales-orders/${id}`, { headers: auth(token) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    data: {
      id: string;
      salesNo: string;
      status: string;
      totalAmount: string | null;
      currency: string;
      carrier: string | null;
      trackingNo: string | null;
      items: Array<{ id: string; itemId: string; qty: string; listPrice: string; price: string; lineTotal: string }>;
      allocations: Array<{ id: string; itemId: string; batchId: string; qty: string }>;
      payment: { amount: string; currency: string; methodNote: string | null } | null;
    };
  };
  return body.data;
}

describe(' 销售单（请货/发货/FEFO 分配）', () => {
  it('创建：卖方/买方类型校验；缺零售价且无行改价 → 400 SALES_LINE_INVALID', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');

    const badSeller = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }], {
      sellerUnitId: COLLECTOR_UNIT,
    });
    expect(badSeller.status).toBe(400);

    const badBuyer = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }], {
      buyerUnitId: WAREHOUSE_UNIT_2,
    });
    expect(badBuyer.status).toBe(400);

    const noPrice = await createOrder(app, 'wh', [{ itemId: ITEM_C, qty: '1' }]);
    expect(noPrice.status).toBe(400);
    expect(await noPrice.json()).toMatchObject({ error: { code: 'SALES_LINE_INVALID' } });
  });

  it('价格快照：行 list_price/price 取零售价或行改价；整单 total = (Σ行小计 × (1-折扣) + 运费)', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');

    const res = await createOrder(app, 'wh', [
      { itemId: ITEM_A, qty: '2' },
      { itemId: ITEM_B, qty: '1', unitPriceOverride: '50' },
    ], { discountPercent: '10', freight: '5', deliveryMethod: 'EXPRESS', deliveryAddress: '上海市某门店' });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string } };
    const order = await getOrder(app, data.id);

    expect(order.status).toBe('DRAFT');
    expect(order.currency).toBe('CNY');
    expect(order.totalAmount).toBe('230.00');
    expect(order.items[0]).toMatchObject({ itemId: ITEM_A, qty: '2', listPrice: '100', price: '100', lineTotal: '200.00' });
    expect(order.items[1]).toMatchObject({ itemId: ITEM_B, qty: '1', listPrice: '50', price: '50', lineTotal: '50.00' });
  });

  it('发送：FEFO 按到期日升序拆批分配（先近效期），库存逐批扣减', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    const late = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-LATE', expiryDate: '2025-03-01',
    });
    const early = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '5', unitCost: '9',
      batchNo: 'B-EARLY', expiryDate: '2025-01-01',
    });

    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '8' }]);
    const { data } = (await res.json()) as { data: { id: string } };
    const sent = await app.request(`/api/v1/sales-orders/${data.id}/send`, {
      method: 'POST', headers: json('wh'), body: '{}',
    });
    expect(sent.status).toBe(200);
    const order = await getOrder(app, data.id);
    expect(order.status).toBe('SENT');
    expect(order.allocations).toHaveLength(2);
    expect(order.allocations[0]).toMatchObject({ batchId: early.batchId, itemId: ITEM_A, qty: '5.00' });
    expect(order.allocations[1]).toMatchObject({ batchId: late.batchId, itemId: ITEM_A, qty: '3.00' });

    const stock = await app.request(`/api/v1/stock?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`, { headers: auth('wh') });
    expect(stock.status).toBe(200);
    const stockBody = (await stock.json()) as { data: { items: Array<{ batchId: string; qty: string }> } };
    const byBatch = new Map(stockBody.data.items.map((r) => [r.batchId, Number(r.qty)]));
    expect(byBatch.get(early.batchId) ?? 0).toBe(0);
    expect(byBatch.get(late.batchId)).toBe(7);
  });

  it('配送信息：仓库发送填写 carrier/trackingNo → 详情返回；零售只读可见；非仓库角色写 → 403', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-1', expiryDate: '2025-03-01',
    });

    // 仓库发送时填写承运商与运单号。
    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const { data } = (await res.json()) as { data: { id: string } };
    const sent = await app.request(`/api/v1/sales-orders/${data.id}/send`, {
      method: 'POST', headers: json('wh'),
      body: JSON.stringify({ carrier: '顺丰速运', trackingNo: 'SF1234567890' }),
    });
    expect(sent.status).toBe(200);
    const order = await getOrder(app, data.id);
    expect(order.carrier).toBe('顺丰速运');
    expect(order.trackingNo).toBe('SF1234567890');

    // 零售作为买方只读可见。
    const rtOrder = await getOrder(app, data.id, 'rt');
    expect(rtOrder.carrier).toBe('顺丰速运');
    expect(rtOrder.trackingNo).toBe('SF1234567890');

    // 自提时两字段可为空：仅 carrier 留空仍可发送。
    const res2 = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const order2 = ((await res2.json()) as { data: { id: string } }).data;
    const sent2 = await app.request(`/api/v1/sales-orders/${order2.id}/send`, {
      method: 'POST', headers: json('wh'), body: '{}',
    });
    expect(sent2.status).toBe(200);
    const order2After = await getOrder(app, order2.id);
    expect(order2After.carrier).toBeNull();
    expect(order2After.trackingNo).toBeNull();

    // 非仓库/非管理员角色（收集员）无 SALES_SEND → 403。
    const res3 = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const order3 = ((await res3.json()) as { data: { id: string } }).data;
    const colSend = await app.request(`/api/v1/sales-orders/${order3.id}/send`, {
      method: 'POST', headers: json('col'),
      body: JSON.stringify({ carrier: '自提', trackingNo: null }),
    });
    expect(colSend.status).toBe(403);
  });

  it('手工覆盖批次：按指定批次分配；数量不匹配 → 400 SALES_LINE_INVALID；批次不存在/不足 → 409', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    const late = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-LATE', expiryDate: '2025-03-01',
    });
    const early = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '5', unitCost: '9',
      batchNo: 'B-EARLY', expiryDate: '2025-01-01',
    });

    // 指定较晚到期批次，全部走该批。
    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '8' }]);
    const { data } = (await res.json()) as { data: { id: string } };
    const sent = await app.request(`/api/v1/sales-orders/${data.id}/send`, {
      method: 'POST', headers: json('wh'),
      body: JSON.stringify({ allocations: [{ itemId: ITEM_A, batchId: late.batchId, qty: '8' }] }),
    });
    expect(sent.status).toBe(200);
    let order = await getOrder(app, data.id);
    expect(order.allocations).toHaveLength(1);
    expect(order.allocations[0]).toMatchObject({ batchId: late.batchId, qty: '8.00' });

    // 数量与行不一致 → SALES_LINE_INVALID（不产生扣减）。
    const res2 = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '8' }]);
    const order2 = ((await res2.json()) as { data: { id: string } }).data;
    const mismatch = await app.request(`/api/v1/sales-orders/${order2.id}/send`, {
      method: 'POST', headers: json('wh'),
      body: JSON.stringify({ allocations: [{ itemId: ITEM_A, batchId: early.batchId, qty: '7' }] }),
    });
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ error: { code: 'SALES_LINE_INVALID' } });

    const res3 = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const order3 = ((await res3.json()) as { data: { id: string } }).data;
    const unknown = await app.request(`/api/v1/sales-orders/${order3.id}/send`, {
      method: 'POST', headers: json('wh'),
      body: JSON.stringify({ allocations: [{ itemId: ITEM_A, batchId: 'deadbeef-0000-4000-8000-000000000000', qty: '1' }] }),
    });
    expect(unknown.status).toBe(409);
    expect(await unknown.json()).toMatchObject({ error: { code: 'STOCK_BATCH_NOT_FOUND' } });

    const res4 = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '99' }]);
    const order4 = ((await res4.json()) as { data: { id: string } }).data;
    const insufficient = await app.request(`/api/v1/sales-orders/${order4.id}/send`, {
      method: 'POST', headers: json('wh'),
      body: JSON.stringify({ allocations: [{ itemId: ITEM_A, batchId: late.batchId, qty: '99' }] }),
    });
    expect(insufficient.status).toBe(409);
    expect(await insufficient.json()).toMatchObject({ error: { code: 'INSUFFICIENT_STOCK' } });
  });

  it('并发发送：两单争抢同一库存，一单成功一单 409，库存不为负', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-1', expiryDate: '2025-03-01',
    });

    const resA = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '6' }]);
    const resB = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '6' }]);
    const orderA = ((await resA.json()) as { data: { id: string } }).data;
    const orderB = ((await resB.json()) as { data: { id: string } }).data;

    const [sendA, sendB] = await Promise.all([
      app.request(`/api/v1/sales-orders/${orderA.id}/send`, { method: 'POST', headers: json('wh'), body: '{}' }),
      app.request(`/api/v1/sales-orders/${orderB.id}/send`, { method: 'POST', headers: json('wh'), body: '{}' }),
    ]);
    const statuses = [sendA.status, sendB.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const failed = sendA.status === 409 ? sendA : sendB;
    expect(await failed.json()).toMatchObject({ error: { code: 'INSUFFICIENT_STOCK' } });

    const stock = await app.request(`/api/v1/stock?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`, { headers: auth('wh') });
    const stockBody = (await stock.json()) as { data: { items: Array<{ qty: string }> } };
    expect(stockBody.data.items).toHaveLength(1);
    expect(Number(stockBody.data.items[0].qty)).toBe(4);
  });

  it('取消回补：SENT 订单取消按原批次回补库存并写 OUTBOUND_SALE_REVERSAL；DRAFT 取消不动库存', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    const late = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-LATE', expiryDate: '2025-03-01',
    });
    const early = await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '5', unitCost: '9',
      batchNo: 'B-EARLY', expiryDate: '2025-01-01',
    });

    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '8' }]);
    const { data } = (await res.json()) as { data: { id: string } };
    const sent = await app.request(`/api/v1/sales-orders/${data.id}/send`, {
      method: 'POST', headers: json('wh'), body: '{}',
    });
    expect(sent.status).toBe(200);

    const cancelled = await app.request(`/api/v1/sales-orders/${data.id}/cancel`, {
      method: 'POST', headers: json('wh'),
    });
    expect(cancelled.status).toBe(200);
    const order = await getOrder(app, data.id);
    expect(order.status).toBe('CANCELLED');

    const stock = await app.request(`/api/v1/stock?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`, { headers: auth('wh') });
    const stockBody = (await stock.json()) as { data: { items: Array<{ batchId: string; qty: string }> } };
    const byBatch = new Map(stockBody.data.items.map((r) => [r.batchId, Number(r.qty)]));
    expect(byBatch.get(early.batchId)).toBe(5);
    expect(byBatch.get(late.batchId)).toBe(10);

    const movements = await app.request(`/api/v1/stock/movements?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`, {
      headers: auth('wh'),
    });
    const movementBody = (await movements.json()) as { data: { items: Array<{ type: string }> } };
    expect(movementBody.data.items.some((m) => m.type === 'OUTBOUND_SALE_REVERSAL')).toBe(true);

    // DRAFT 取消：不产生扣减/回补，状态直接 CANCELLED。
    const res2 = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const order2 = ((await res2.json()) as { data: { id: string } }).data;
    const cancelled2 = await app.request(`/api/v1/sales-orders/${order2.id}/cancel`, {
      method: 'POST', headers: json('wh'),
    });
    expect(cancelled2.status).toBe(200);

    // 重复取消 → 409。
    const again = await app.request(`/api/v1/sales-orders/${order2.id}/cancel`, {
      method: 'POST', headers: json('wh'),
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'SALES_STATE_CONFLICT' } });
  });

  it('支付上传 + 确认收货闭环；状态机与角色权限', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-1', expiryDate: '2025-03-01',
    });

    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const { data } = (await res.json()) as { data: { id: string } };
    const sent = await app.request(`/api/v1/sales-orders/${data.id}/send`, {
      method: 'POST', headers: json('wh'), body: '{}',
    });
    expect(sent.status).toBe(200);

    // 仓库无支付权限。
    const payByWh = await app.request(`/api/v1/sales-orders/${data.id}/payments`, {
      method: 'POST', headers: json('wh'),
      body: JSON.stringify({ amount: '100' }),
    });
    expect(payByWh.status).toBe(403);

    // 零售支付（DRAFT 前不允许支付 → 已在 SENT 后，OK）。
    const paid = await app.request(`/api/v1/sales-orders/${data.id}/payments`, {
      method: 'POST', headers: json('rt'),
      body: JSON.stringify({ amount: '100', methodNote: '微信转账' }),
    });
    expect(paid.status).toBe(201);
    let order = await getOrder(app, data.id);
    expect(order.status).toBe('PAYMENT_UPLOADED');
    expect(order.payment).toMatchObject({ amount: '100', currency: 'CNY', methodNote: '微信转账' });

    // 仓库无确认收货权限；零售确认收货 → CONFIRMED。
    const confirmByWh = await app.request(`/api/v1/sales-orders/${data.id}/confirm-receipt`, {
      method: 'POST', headers: json('wh'),
    });
    expect(confirmByWh.status).toBe(403);

    const confirmed = await app.request(`/api/v1/sales-orders/${data.id}/confirm-receipt`, {
      method: 'POST', headers: json('rt'),
    });
    expect(confirmed.status).toBe(200);
    order = await getOrder(app, data.id);
    expect(order.status).toBe('CONFIRMED');

    // CONFIRMED 后取消 → 409。
    const cancelConfirmed = await app.request(`/api/v1/sales-orders/${data.id}/cancel`, {
      method: 'POST', headers: json('wh'),
    });
    expect(cancelConfirmed.status).toBe(409);
    expect(await cancelConfirmed.json()).toMatchObject({ error: { code: 'SALES_STATE_CONFLICT' } });

    // 零售不能发送/取消。
    const res2 = await createOrder(app, 'rt', [{ itemId: ITEM_A, qty: '1' }]);
    const order2 = ((await res2.json()) as { data: { id: string } }).data;
    const sendByRt = await app.request(`/api/v1/sales-orders/${order2.id}/send`, {
      method: 'POST', headers: json('rt'), body: '{}',
    });
    expect(sendByRt.status).toBe(403);
    const cancelByRt = await app.request(`/api/v1/sales-orders/${order2.id}/cancel`, {
      method: 'POST', headers: json('rt'),
    });
    expect(cancelByRt.status).toBe(403);
  });

  it('scope 过滤：列表只含买方/卖方单元；跨单元查看 403', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-1', expiryDate: '2025-03-01',
    });

    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const { data } = (await res.json()) as { data: { id: string } };

    // 其它仓库/其它零售看不到。
    const otherWh = await app.request(`/api/v1/sales-orders/${data.id}`, { headers: auth('wh2') });
    expect(otherWh.status).toBe(403);
    const otherRt = await app.request(`/api/v1/sales-orders/${data.id}`, { headers: auth('rt2') });
    expect(otherRt.status).toBe(403);

    // 零售自己的列表可见（买方），仓库列表可见（卖方）。
    const rtList = await app.request('/api/v1/sales-orders', { headers: auth('rt') });
    expect(rtList.status).toBe(200);
    expect(((await rtList.json()) as { data: { items: Array<{ id: string }> } }).data.items.map((i) => i.id)).toContain(data.id);

    const whList = await app.request('/api/v1/sales-orders', { headers: auth('wh') });
    expect(((await whList.json()) as { data: { items: Array<{ id: string }> } }).data.items.map((i) => i.id)).toContain(data.id);
  });

  it('零售请货：未签约仓库 → 403；已签约仓库可创建', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-1', expiryDate: '2025-03-01',
    });

    // 零售向未签约的仓库二请货 → 403。
    const unsigned = await createOrder(app, 'rt', [{ itemId: ITEM_A, qty: '1' }], {
      sellerUnitId: WAREHOUSE_UNIT_2,
    });
    expect(unsigned.status).toBe(403);

    // 零售向已签约的仓库一请货 → 201。
    const signed = await createOrder(app, 'rt', [{ itemId: ITEM_A, qty: '1' }]);
    expect(signed.status).toBe(201);
  });

  it('零售只读：库存/零售价无成本字段：RETAILER 看不到 avgCost/unitCost', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-1', expiryDate: '2025-03-01',
    });

    const whStock = await app.request(`/api/v1/stock?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`, { headers: auth('wh') });
    const whBody = (await whStock.json()) as { data: { items: Array<Record<string, unknown>> } };
    expect(whBody.data.items[0].avgCost).toBeDefined();

    const rtStock = await app.request(`/api/v1/stock?unitId=${WAREHOUSE_UNIT}&itemId=${ITEM_A}`, { headers: auth('rtg') });
    expect(rtStock.status).toBe(200);
    const rtBody = (await rtStock.json()) as { data: { items: Array<Record<string, unknown>> } };
    expect(rtBody.data.items[0].avgCost).toBeUndefined();

    const rtPrices = await app.request('/api/v1/retail-prices', { headers: auth('rtg') });
    const priceBody = (await rtPrices.json()) as { data: { items: Array<Record<string, unknown>> } };
    const row = priceBody.data.items.find((r) => r.itemId === ITEM_A);
    expect(row?.price).toBe('100');
    expect(row?.unitCost).toBeUndefined();

    const whPrices = await app.request('/api/v1/retail-prices', { headers: auth('wh') });
    const whPriceBody = (await whPrices.json()) as { data: { items: Array<Record<string, unknown>> } };
    const whRow = whPriceBody.data.items.find((r) => r.itemId === ITEM_A);
    expect(whRow?.unitCost).toBeDefined();
  });

  it('删除 DRAFT 销售单成功，随后 GET 404', async () => {
    const { app } = makeApp();
    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1', unitPriceOverride: '50' }]);
    expect(res.status).toBe(201);
    const id = ((await res.json()) as { data: { id: string } }).data.id;

    const del = await app.request(`/api/v1/sales-orders/${id}`, {
      method: 'DELETE',
      headers: auth('wh'),
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toMatchObject({ data: { id } });

    const get = await app.request(`/api/v1/sales-orders/${id}`, { headers: auth('wh') });
    expect(get.status).toBe(404);
  });

  it('非 DRAFT（SENT）销售单删除返回 409 SALES_STATE_CONFLICT', async () => {
    const { app } = makeApp();
    await setPrice(app, WAREHOUSE_UNIT, ITEM_A, '100');
    await seedStock(app, {
      warehouseUnitId: WAREHOUSE_UNIT, itemId: ITEM_A, qty: '10', unitCost: '8',
      batchNo: 'B-DEL', expiryDate: '2025-03-01',
    });
    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1' }]);
    const id = ((await res.json()) as { data: { id: string } }).data.id;
    const sent = await app.request(`/api/v1/sales-orders/${id}/send`, {
      method: 'POST', headers: json('wh'), body: '{}',
    });
    expect(sent.status).toBe(200);

    const del = await app.request(`/api/v1/sales-orders/${id}`, {
      method: 'DELETE',
      headers: auth('wh'),
    });
    expect(del.status).toBe(409);
    expect(await del.json()).toMatchObject({ error: { code: 'SALES_STATE_CONFLICT' } });
  });

  it('无 SALES_CREATE 权限（COLLECTOR）删除销售单返回 403', async () => {
    const { app } = makeApp();
    const res = await createOrder(app, 'wh', [{ itemId: ITEM_A, qty: '1', unitPriceOverride: '50' }]);
    const id = ((await res.json()) as { data: { id: string } }).data.id;

    const del = await app.request(`/api/v1/sales-orders/${id}`, {
      method: 'DELETE',
      headers: auth('col'),
    });
    expect(del.status).toBe(403);
  });

  it('删除不存在的销售单返回 404', async () => {
    const { app } = makeApp();
    const del = await app.request('/api/v1/sales-orders/00000000-0000-4000-8000-0000000000ff', {
      method: 'DELETE',
      headers: auth('wh'),
    });
    expect(del.status).toBe(404);
  });
});
