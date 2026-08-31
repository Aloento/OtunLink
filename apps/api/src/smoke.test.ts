import { describe, expect, it } from 'vitest';

import { createApp } from './index';
import { createMemoryRepos } from './repos/memory';
import type { ItemRecord, TokenClaims, UnitRecord, UserRecord } from './types';

// ck-10 全链路冒烟（vitest，api 层）：集货发发货单 → 仓库点货 → 确认入库 → 手动出库 →
// 零售销售单（发送/支付/确认收货）→ 售后退货（申请/审核/收货），并校验通知/审计/工作台。

const now = new Date('2025-01-01T00:00:00.000Z');

const COLLECTOR_UNIT = '00000000-0000-4000-8000-000000000001';
const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000003';
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
const retailer = user({ entraSub: 'retailer', role: 'RETAILER', scopeUnitId: RETAIL_UNIT });
const admin = user({ entraSub: 'admin', role: 'ADMIN' });

const units = [
  unit({ id: COLLECTOR_UNIT, type: 'COLLECTOR', name: '上海集货部' }),
  unit({ id: WAREHOUSE_UNIT, type: 'WAREHOUSE', name: '匈牙利仓库' }),
  unit({ id: RETAIL_UNIT, type: 'RETAILER', name: '零售门店一' }),
];

const items = [item({ id: ITEM_A, name: '苹果', specUnit: 'PIECE', isPerishable: false })];

function makeApp() {
  const repos = createMemoryRepos({ users: [collector, warehouse, retailer, admin], units, items });
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

async function data<T>(res: Response): Promise<T> {
  const payload = (await res.json()) as { data: T };
  return payload.data;
}

describe('ck-10 全链路冒烟', () => {
  it('集货→仓库→零售→售后 全流程：状态流转 + 站内通知 + 审计日志 + 工作台待办', async () => {
    const { app } = makeApp();

    // ---- 1. 集货创建发货单并发送（SENT）----
    let res = await app.request('/api/v1/shipments', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({
        shipperUnitId: COLLECTOR_UNIT,
        receiverUnitId: WAREHOUSE_UNIT,
        boxesCount: 1,
        currency: 'CNY',
        trackings: [{ carrier: 'SF', trackingNo: 'SF-SMOKE-1', note: null }],
        items: [{ itemId: ITEM_A, expectedQty: 5, unitPrice: '1.50' }],
      }),
    });
    expect(res.status).toBe(201);
    const shipmentId = (await data<{ id: string }>(res)).id;

    res = await app.request(`/api/v1/shipments/${shipmentId}/send`, {
      method: 'POST',
      headers: json('collector'),
      body: '{}',
    });
    expect(res.status).toBe(200);

    // ---- 2. 仓库点货（无差异 → READY）----
    res = await app.request(`/api/v1/shipments/${shipmentId}/start-counting`, {
      method: 'POST',
      headers: json('warehouse'),
      body: '{}',
    });
    expect(res.status).toBe(200);

    res = await app.request(`/api/v1/shipments/${shipmentId}`, { headers: auth('warehouse') });
    expect(res.status).toBe(200);
    const shipmentItemId = (await data<{ items: { id: string }[] }>(res)).items[0].id;

    res = await app.request(`/api/v1/shipments/${shipmentId}/count`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        version: 0,
        items: [{ shipmentItemId, actualQty: '5' }],
      }),
    });
    expect(res.status).toBe(200);

    // ---- 3. 确认入库（→ DRAFT 入库单 + 发货单 INBOUNDED）----
    res = await app.request(`/api/v1/shipments/${shipmentId}/confirm-receipt`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ shipmentItemId, batchNo: 'B-SMOKE-1' }] }),
    });
    expect(res.status).toBe(201);
    const inboundId = (await data<{ id: string }>(res)).id;

    // ---- 4. 入库过账（POSTED，库存 +5）----
    res = await app.request(`/api/v1/inbound-orders/${inboundId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
      body: '{}',
    });
    expect(res.status).toBe(200);

    // ---- 5. 手动出库 2 件并过账（库存 3）----
    res = await app.request('/api/v1/outbound-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        warehouseUnitId: WAREHOUSE_UNIT,
        counterpartyUnitId: COLLECTOR_UNIT,
        remark: '冒烟出库',
        lines: [{ itemId: ITEM_A, qty: '2' }],
      }),
    });
    expect(res.status).toBe(201);
    const outboundId = (await data<{ id: string }>(res)).id;

    res = await app.request(`/api/v1/outbound-orders/${outboundId}/post`, {
      method: 'POST',
      headers: json('warehouse'),
      body: '{}',
    });
    expect(res.status).toBe(200);

    // ---- 6. 零售价（审计 RETAIL_PRICE_UPDATE）----
    res = await app.request('/api/v1/retail-prices', {
      method: 'PUT',
      headers: json('warehouse'),
      body: JSON.stringify({ unitId: WAREHOUSE_UNIT, itemId: ITEM_A, price: '100', currency: 'CNY' }),
    });
    expect(res.status).toBe(200);

    // ---- 7. 销售单：创建 → 发送 → 支付上传 → 确认收货（CONFIRMED）----
    res = await app.request('/api/v1/sales-orders', {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({
        sellerUnitId: WAREHOUSE_UNIT,
        buyerUnitId: RETAIL_UNIT,
        source: 'RETAILER_REQUEST',
        deliveryMethod: 'PICKUP',
        lines: [{ itemId: ITEM_A, qty: '3' }],
      }),
    });
    expect(res.status).toBe(201);
    const salesOrderId = (await data<{ id: string }>(res)).id;

    res = await app.request(`/api/v1/sales-orders/${salesOrderId}/send`, {
      method: 'POST',
      headers: json('warehouse'),
      body: '{}',
    });
    expect(res.status).toBe(200);

    res = await app.request(`/api/v1/sales-orders/${salesOrderId}`, { headers: auth('retailer') });
    expect(res.status).toBe(200);
    const salesOrderItemId = (await data<{ items: { id: string }[] }>(res)).items[0].id;

    res = await app.request(`/api/v1/sales-orders/${salesOrderId}/payments`, {
      method: 'POST',
      headers: json('retailer'),
      body: JSON.stringify({ amount: '100', methodNote: '扫码支付' }),
    });
    expect(res.status).toBe(201);

    res = await app.request(`/api/v1/sales-orders/${salesOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: json('retailer'),
      body: '{}',
    });
    expect(res.status).toBe(200);

    // ---- 8. 售后退货：申请（零售）→ 审核同意（仓库）→ 收货（仓库）----
    res = await app.request(`/api/v1/sales-orders/${salesOrderId}/returns`, {
      method: 'POST',
      headers: json('retailer'),
      body: JSON.stringify({ reason: '尺寸不合适', items: [{ salesOrderItemId, qty: '1' }] }),
    });
    expect(res.status).toBe(201);
    const returnData = await data<{ id: string; items: { id: string }[] }>(res);
    const returnId = returnData.id;
    const returnItemId = returnData.items[0].id;

    res = await app.request(`/api/v1/return-orders/${returnId}/approve`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ note: '同意退货' }),
    });
    expect(res.status).toBe(200);

    res = await app.request(`/api/v1/return-orders/${returnId}/receive`, {
      method: 'POST',
      headers: json('warehouse'),
      body: JSON.stringify({ items: [{ returnItemId, receivedQty: '1' }] }),
    });
    expect(res.status).toBe(200);

    // ---- 9. 站内通知：仓库看到发送/支付/确认/售后申请等关键事件 ----
    res = await app.request('/api/v1/notifications', { headers: auth('warehouse') });
    expect(res.status).toBe(200);
    const warehouseNotis = (await data<{ items: { id: string; type: string }[] }>(res)).items;
    const warehouseTypes = warehouseNotis.map((n) => n.type);
    expect(warehouseTypes).toEqual(
      expect.arrayContaining(['SHIPMENT_SENT', 'SALES_PAYMENT_UPLOADED', 'SALES_CONFIRMED', 'AFTER_SALE_REQUESTED']),
    );
    expect(warehouseTypes).not.toContain('SALES_SENT');

    // 零售方：销售单已发货 + 售后审核通过/收货完成
    res = await app.request('/api/v1/notifications', { headers: auth('retailer') });
    const retailerNotis = (await data<{ items: { id: string; type: string }[] }>(res)).items;
    const retailerTypes = retailerNotis.map((n) => n.type);
    expect(retailerTypes).toEqual(
      expect.arrayContaining(['SALES_SENT', 'AFTER_SALE_APPROVED', 'AFTER_SALE_RETURNED']),
    );
    expect(retailerTypes).not.toContain('INBOUND_CONFIRMED');

    // ---- 10. 未读数 + 批量已读（零售方全部已读）----
    res = await app.request('/api/v1/notifications/unread-count', { headers: auth('retailer') });
    expect(res.status).toBe(200);
    const before = (await data<{ count: number }>(res)).count;
    expect(before).toBeGreaterThan(0);

    res = await app.request('/api/v1/notifications/read', {
      method: 'POST',
      headers: json('retailer'),
      body: JSON.stringify({ ids: retailerNotis.map((n) => n.id) }),
    });
    expect(res.status).toBe(200);
    const readResult = await data<{ updated: number; unread: number }>(res);
    expect(readResult.updated).toBe(retailerNotis.length);
    expect(readResult.unread).toBe(0);

    // ---- 11. 工作台待办：仓库关键待办计数归零 ----
    res = await app.request('/api/v1/dashboard/todos', { headers: auth('warehouse') });
    expect(res.status).toBe(200);
    const todos = (await data<{ items: { key: string; count: number }[] }>(res)).items;
    expect(todos.length).toBeGreaterThanOrEqual(5);
    expect(todos.find((t) => t.key === 'shipments-to-count')?.count).toBe(0);
    expect(todos.find((t) => t.key === 'shipments-to-confirm')?.count).toBe(0);
    expect(todos.find((t) => t.key === 'inbounds-to-post')?.count).toBe(0);
    expect(todos.find((t) => t.key === 'outbounds-to-post')?.count).toBe(0);

    // ---- 12. 审计日志：ADMIN 可查（按 entityType/entityId 筛选）；零售方 403 ----
    res = await app.request(
      `/api/v1/admin/audit-logs?entityType=sales_order&entityId=${salesOrderId}`,
      { headers: auth('admin') },
    );
    expect(res.status).toBe(200);
    const audit = await data<{ total: number; items: { action: string }[] }>(res);
    expect(audit.total).toBeGreaterThanOrEqual(1);
    expect(audit.items.map((a) => a.action)).toContain('SALES_SEND');

    res = await app.request(
      `/api/v1/admin/audit-logs?entityType=return_order&entityId=${returnId}`,
      { headers: auth('admin') },
    );
    const returnAudit = await data<{ total: number; items: { action: string }[] }>(res);
    expect(returnAudit.items.map((a) => a.action)).toEqual(
      expect.arrayContaining(['AFTER_SALE_APPROVE', 'AFTER_SALE_RECEIVE']),
    );

    res = await app.request('/api/v1/admin/audit-logs', { headers: auth('retailer') });
    expect(res.status).toBe(403);
  });

  it('邮件连通性：未配置 SMTP 时 ADMIN 得到降级原因（200）；非 ADMIN 403', async () => {
    const { app } = makeApp();
    let res = await app.request('/api/v1/admin/test-email', {
      method: 'POST',
      headers: json('admin'),
      body: '{}',
    });
    expect(res.status).toBe(200);
    const result = await data<{ ok: boolean; provider: string; reason: string }>(res);
    expect(result.ok).toBe(false);
    expect(result.provider).toBe('smtp');
    expect(result.reason).toContain('未配置 SMTP_HOST');

    res = await app.request('/api/v1/admin/test-email', {
      method: 'POST',
      headers: json('retailer'),
      body: '{}',
    });
    expect(res.status).toBe(403);
  });
});
