import type { DashboardTodoItem } from '@otunlink/shared';
import { Hono } from 'hono';

import { requireActive, requireUnitScopeAssigned } from '../auth/middleware';
import { dbUnavailable, ok } from '../lib/http';
import { loadPartnerWarehouseIds } from '../lib/partnerships';
import type { AppEnv, Repos } from '../types';

// 工作台待办聚合：按岗位 + 数据范围返回待办列表（供 `/` 首页）。
// 复用各业务列表查询（page=1&size=1 只取 total），避免新增聚合 SQL。

export type { DashboardTodoItem };

export function dashboardRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requireActive());
  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

  router.get('/todos', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const user = c.get('auth').user!;
    const scopeUnitId = user.scopeUnitId;
    const items = await collectTodos(repos, user.role ?? 'RETAILER', scopeUnitId);
    return ok(c, { items });
  });

  return router;
}

const EXPIRING_WINDOW_DAYS = 7;

async function collectTodos(
  repos: Repos,
  role: string,
  scopeUnitId: string | null,
): Promise<DashboardTodoItem[]> {
  const unit = scopeUnitId ?? undefined;
  if (role === 'COLLECTOR') {
    const [reviews, shipmentReturns, salesReturns] = await Promise.all([
      repos.shipments.list({ page: 1, size: 1, status: 'REVIEW_PENDING', scopeUnitId: unit }),
      repos.returns.list({ page: 1, size: 1, status: 'PENDING', sourceType: 'SHIPMENT', scopeUnitId: unit }),
      repos.returns.list({ page: 1, size: 1, status: 'REQUESTED', sourceType: 'SALES', scopeUnitId: unit }),
    ]);
    return [
      { key: 'reviews-to-approve', label: '差异修订待审批', count: reviews.total, link: '/shipments?status=REVIEW_PENDING' },
      { key: 'shipment-returns-to-handle', label: '发货退货待处理', count: shipmentReturns.total, link: '/returns?status=PENDING&sourceType=SHIPMENT' },
      { key: 'sales-returns-to-review', label: '售后退货待审核', count: salesReturns.total, link: '/returns?status=REQUESTED&sourceType=SALES' },
    ];
  }

  if (role === 'RETAILER') {
    const partnerIds = await loadPartnerWarehouseIds(repos, unit!);
    const [toPay, toReceive, toReturn] = await Promise.all([
      repos.sales.list({ page: 1, size: 1, status: 'SENT', buyerUnitId: unit, sellerUnitIds: partnerIds }),
      repos.sales.list({ page: 1, size: 1, status: 'PAYMENT_UPLOADED', buyerUnitId: unit, sellerUnitIds: partnerIds }),
      repos.returns.list({ page: 1, size: 1, status: 'REQUESTED', sourceType: 'SALES', scopeUnitId: unit }),
    ]);
    return [
      { key: 'sales-to-pay', label: '销售单待支付', count: toPay.total, link: '/sales?status=SENT' },
      { key: 'sales-to-receive', label: '销售单待收货', count: toReceive.total, link: '/sales?status=PAYMENT_UPLOADED' },
      { key: 'sales-returns-pending', label: '售后退货待审核', count: toReturn.total, link: '/returns?status=REQUESTED&sourceType=SALES' },
    ];
  }

  // WAREHOUSE / ADMIN（ADMIN 无 scope 时聚合全部）
  const [toCount, toConfirm, inboundDraft, outboundDraft, expiring, salesToShip] = await Promise.all([
    repos.shipments.list({ page: 1, size: 1, status: 'SENT', scopeUnitId: unit }),
    repos.shipments.list({ page: 1, size: 1, status: 'READY', scopeUnitId: unit }),
    repos.inbounds.list({ page: 1, size: 1, status: 'DRAFT', warehouseUnitId: unit }),
    repos.outbounds.list({ page: 1, size: 1, status: 'DRAFT', warehouseUnitId: unit }),
    countExpiringBatches(repos, unit),
    repos.sales.list({ page: 1, size: 1, status: 'DRAFT', unitId: unit }),
  ]);
  const items: DashboardTodoItem[] = [
    { key: 'shipments-to-count', label: '待点货', count: toCount.total, link: '/shipments?status=SENT' },
    { key: 'shipments-to-confirm', label: '待确认入库', count: toConfirm.total, link: '/shipments?status=READY' },
    { key: 'inbounds-to-post', label: '入库单待过账', count: inboundDraft.total, link: '/inbound?status=DRAFT' },
    { key: 'outbounds-to-post', label: '出库单待过账', count: outboundDraft.total, link: '/outbound?status=DRAFT' },
    { key: 'expiring-batches', label: '效期预警（7 天内到期）', count: expiring, link: '/inventory?tab=expiring' },
  ];
  if (role === 'WAREHOUSE' && scopeUnitId) {
    items.push({
      key: 'sales-draft-to-send',
      label: '销售单待发送',
      count: salesToShip.total,
      link: '/sales?status=DRAFT',
    });
  }
  return items;
}

async function countExpiringBatches(repos: Repos, unitId?: string): Promise<number> {
  const batches = await repos.stock.listBatches({ unitId });
  return batches.filter(
    (b) => b.remainingDays !== null && b.remainingDays >= 0 && b.remainingDays <= EXPIRING_WINDOW_DAYS,
  ).length;
}
