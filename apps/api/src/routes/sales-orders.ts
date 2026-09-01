import {
  ErrorCodes,
  Permissions,
  salesConfirmReceiptSchema,
  salesOrderCreateSchema,
  salesOrderPatchSchema,
  salesOrderSendSchema,
  salesPaymentSchema,
  salesReturnCreateSchema,
  type SalesStatus,
} from '@otunlink/shared';
import { Hono } from 'hono';

import { requireAnyPermission, requirePermission, requireUnitScopeAssigned, unitScopeFilter } from '../auth/middleware';
import { createMailer } from '../lib/email';
import {
  returnDto,
  returnItemDto,
  salesAllocationDto,
  salesOrderDto,
  salesOrderItemDto,
  salesPaymentDto,
} from '../lib/dto';
import { dbUnavailable, error, forbidden, notFound, ok, validationError } from '../lib/http';
import { recordAudit } from '../lib/audit';
import { notify } from '../lib/notify';
import { loadPartnerWarehouseIds } from '../lib/partnerships';
import type { AppEnv, ReturnOrderRecord, SalesOrderRecord, Repos } from '../types';

// 销售单：DRAFT → SENT（FEFO/手工分配）→ PAYMENT_UPLOADED → CONFIRMED；
// DRAFT/SENT/PAYMENT_UPLOADED → CANCELLED（回补）。买方=零售单元、卖方=仓库单元。
export function salesOrdersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const view = requireAnyPermission(Permissions.SALES_REQUEST, Permissions.SALES_SEND);
  const createPermission = requirePermission(Permissions.SALES_CREATE);

  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

  router.get('/', view, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const statusRaw = c.req.query('status')?.trim() ?? '';
    const status = (SALES_STATUS_FILTER.has(statusRaw) ? statusRaw : undefined) as
      | SalesStatus
      | undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));
    const user = c.get('auth').user!;

    // RETAILER 仅可见「自身为买方且卖方 ∈ 已签约仓库」的订单；其它角色按 scope 收敛。
    const result =
      user.role === 'RETAILER'
        ? await repos.sales.list({
            page,
            size,
            status,
            buyerUnitId: user.scopeUnitId!,
            sellerUnitIds: await loadPartnerWarehouseIds(repos, user.scopeUnitId!),
          })
        : await repos.sales.list({ page, size, status, unitId: scope?.unitId });
    const items = await hydrateList(repos, result.items);
    return ok(c, { ...result, items });
  });

  router.post('/', createPermission, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = salesOrderCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;
    const user = c.get('auth').user!;

    const [seller, buyer] = await Promise.all([
      repos.units.findById(input.sellerUnitId),
      repos.units.findById(input.buyerUnitId),
    ]);
    if (!seller || seller.type !== 'WAREHOUSE') {
      return validationError(c, '卖方业务单元必须为仓库类型（WAREHOUSE）');
    }
    if (!buyer || buyer.type !== 'RETAILER') {
      return validationError(c, '买方业务单元必须为零售类型（RETAILER）');
    }

    const scope = user.scopeUnitId;
    if (scope) {
      if (user.role === 'WAREHOUSE' && input.sellerUnitId !== scope) {
        return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
      }
      if (user.role === 'RETAILER' && input.buyerUnitId !== scope) {
        return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
      }
    }

    // RETAILER 请货：卖方仓库必须 ∈ 已签约仓库。
    if (user.role === 'RETAILER') {
      const partnerIds = await loadPartnerWarehouseIds(repos, scope!);
      if (!partnerIds.includes(input.sellerUnitId)) {
        return forbidden(c, '未与该仓库签约，无法请货');
      }
    }

    const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
    const found = await Promise.all(itemIds.map((id) => repos.items.findById(id)));
    const missing = itemIds.filter((id, index) => !found[index]);
    if (missing.length > 0) {
      return validationError(c, '部分物品不存在', { itemIds: missing });
    }

    try {
      const created = await repos.sales.create({
        sellerUnitId: input.sellerUnitId,
        buyerUnitId: input.buyerUnitId,
        source: input.source,
        deliveryMethod: input.deliveryMethod,
        deliveryAddress: input.deliveryAddress ?? null,
        freight: input.freight,
        discountPercent: input.discountPercent,
        currency: input.currency ?? seller.baseCurrency ?? 'CNY',
        remark: input.remark ?? null,
        items: input.lines.map((l) => ({
          itemId: l.itemId,
          qty: l.qty,
          unitPriceOverride: l.unitPriceOverride ?? null,
        })),
        createdBy: user.id,
      });
      return ok(c, await detailOf(repos, created), 201);
    } catch (cause) {
      if (isSignal(cause, 'SALES_LINE_INVALID')) {
        return error(
          c,
          400,
          ErrorCodes.SALES_LINE_INVALID,
          '行价格缺失或无效（需已设置零售价或提供行级改价）',
        );
      }
      throw cause;
    }
  });

  router.get('/:id', view, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.sales.findById(c.req.param('id'));
    if (!order) return notFound(c, '销售单不存在');
    if (!scopeAllowsOrder(c.get('auth').user?.scopeUnitId ?? null, order)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }
    return ok(c, await detailOf(repos, order));
  });

  router.patch('/:id', createPermission, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.sales.findById(c.req.param('id'));
    if (!order) return notFound(c, '销售单不存在');
    if (!scopeAllowsOrder(c.get('auth').user?.scopeUnitId ?? null, order)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = salesOrderPatchSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;

    try {
      const updated = await repos.sales.update(order.id, {
        deliveryMethod: input.deliveryMethod,
        deliveryAddress: input.deliveryAddress,
        freight: input.freight,
        discountPercent: input.discountPercent,
        currency: input.currency,
        remark: input.remark,
        items: input.lines?.map((l) => ({
          itemId: l.itemId,
          qty: l.qty,
          unitPriceOverride: l.unitPriceOverride ?? null,
        })),
      });
      if (!updated) return notFound(c, '销售单不存在');
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      return mapSalesSignal(c, cause);
    }
  });

  router.post('/:id/send', requirePermission(Permissions.SALES_SEND), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.sales.findById(c.req.param('id'));
    if (!order) return notFound(c, '销售单不存在');
    if (!isScopeOf(c.get('auth').user?.scopeUnitId ?? null, order.sellerUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const body = await readJson(c);
    const parsed = salesOrderSendSchema.safeParse(body === undefined ? {} : body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;

    try {
      const sent = await repos.sales.send(
        order.id,
        (input.allocations ?? []).map((a) => ({
          itemId: a.itemId,
          batchId: a.batchId,
          qty: String(a.qty),
        })),
        c.get('auth').user!.id,
        { carrier: input.carrier ?? null, trackingNo: input.trackingNo ?? null },
      );
      if (!sent) return notFound(c, '销售单不存在');
      await notify(repos, createMailer(c.env), {
        type: 'SALES_SENT',
        title: `销售单 ${sent.salesNo} 已发货，请查收并支付`,
        content: '仓库已发货，请零售方收货后上传支付凭证。',
        link: `/sales-orders/${sent.id}`,
        unitId: sent.buyerUnitId,
      });
      await recordAudit(repos, {
        userId: c.get('auth').user!.id,
        action: 'SALES_SEND',
        entityType: 'sales_order',
        entityId: sent.id,
        before: { status: order.status },
        after: { status: sent.status },
      });
      return ok(c, await detailOf(repos, sent));
    } catch (cause) {
      return mapSalesSignal(c, cause);
    }
  });

  router.post('/:id/cancel', requirePermission(Permissions.SALES_CANCEL), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.sales.findById(c.req.param('id'));
    if (!order) return notFound(c, '销售单不存在');
    if (!isScopeOf(c.get('auth').user?.scopeUnitId ?? null, order.sellerUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    try {
      const cancelled = await repos.sales.cancel(order.id, c.get('auth').user!.id);
      if (!cancelled) return notFound(c, '销售单不存在');
      await notify(repos, createMailer(c.env), {
        type: 'SALES_CANCELLED',
        title: `销售单 ${cancelled.salesNo} 已取消`,
        content: '该销售单已被取消，库存已回补。',
        link: `/sales-orders/${cancelled.id}`,
        unitId: cancelled.buyerUnitId,
      });
      await recordAudit(repos, {
        userId: c.get('auth').user!.id,
        action: 'SALES_CANCEL',
        entityType: 'sales_order',
        entityId: cancelled.id,
        before: { status: order.status },
        after: { status: cancelled.status },
      });
      return ok(c, await detailOf(repos, cancelled));
    } catch (cause) {
      return mapSalesSignal(c, cause);
    }
  });

  router.post('/:id/payments', requirePermission(Permissions.SALES_PAYMENT), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.sales.findById(c.req.param('id'));
    if (!order) return notFound(c, '销售单不存在');
    if (!isScopeOf(c.get('auth').user?.scopeUnitId ?? null, order.buyerUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = salesPaymentSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;

    if (input.proofFileId) {
      const file = await repos.files.findById(input.proofFileId);
      if (!file) return validationError(c, '支付凭证文件不存在', { proofFileId: input.proofFileId });
    }

    try {
      const payment = await repos.sales.uploadPayment(order.id, {
        amount: String(input.amount),
        currency: input.currency ?? order.currency,
        methodNote: input.methodNote ?? null,
        proofFileId: input.proofFileId ?? null,
        uploadedBy: c.get('auth').user!.id,
      });
      if (!payment) return notFound(c, '销售单不存在');
      await notify(repos, createMailer(c.env), {
        type: 'SALES_PAYMENT_UPLOADED',
        title: `销售单 ${order.salesNo} 已上传支付凭证，请确认`,
        content: '零售方已上传支付凭证，请仓库确认到账。',
        link: `/sales-orders/${order.id}`,
        unitId: order.sellerUnitId,
      });
      return ok(c, { ...salesPaymentDto(payment) }, 201);
    } catch (cause) {
      return mapSalesSignal(c, cause);
    }
  });

  router.post('/:id/confirm-receipt', requirePermission(Permissions.SALES_CONFIRM_RECEIPT), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.sales.findById(c.req.param('id'));
    if (!order) return notFound(c, '销售单不存在');
    if (!isScopeOf(c.get('auth').user?.scopeUnitId ?? null, order.buyerUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const body = await readJson(c);
    const parsed = salesConfirmReceiptSchema.safeParse(body === undefined ? {} : body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const confirmed = await repos.sales.confirmReceipt(order.id, c.get('auth').user!.id);
      if (!confirmed) return notFound(c, '销售单不存在');
      await notify(repos, createMailer(c.env), {
        type: 'SALES_CONFIRMED',
        title: `销售单 ${confirmed.salesNo} 已确认收货，交易完成`,
        content: '零售方已确认收货，该销售单已完成。',
        link: `/sales-orders/${confirmed.id}`,
        unitId: confirmed.sellerUnitId,
      });
      return ok(c, await detailOf(repos, confirmed));
    } catch (cause) {
      return mapSalesSignal(c, cause);
    }
  });

  // ── 零售售后退货（source_type=SALES）───────────────────────────────
  router.post('/:id/returns', requirePermission(Permissions.AFTER_SALE_CREATE), async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.sales.findById(c.req.param('id'));
    if (!order) return notFound(c, '销售单不存在');
    if (!isScopeOf(c.get('auth').user?.scopeUnitId ?? null, order.buyerUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = salesReturnCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;

    const photoIds = [...new Set(input.photoFileIds ?? [])];
    if (photoIds.length > 0) {
      const files = await Promise.all(photoIds.map((id) => repos.files.findById(id)));
      const missing = photoIds.filter((id, index) => !files[index]);
      if (missing.length > 0) {
        return validationError(c, '部分退货照片不存在', { photoFileIds: missing });
      }
    }

    try {
      const created = await repos.returns.createFromSales({
        salesOrderId: order.id,
        reason: input.reason ?? null,
        note: input.note ?? null,
        photoFileIds: photoIds,
        createdBy: c.get('auth').user!.id,
        lines: input.items.map((l) => ({
          salesOrderItemId: l.salesOrderItemId,
          qty: String(l.qty),
          reason: l.reason ?? null,
        })),
      });
      await notify(repos, createMailer(c.env), {
        type: 'AFTER_SALE_REQUESTED',
        title: `销售单 ${order.salesNo} 发起售后退货，请审核`,
        content: '零售方发起了售后退货申请，请仓库审核处理。',
        link: `/sales-orders/${order.id}`,
        unitId: order.sellerUnitId,
      });
      return ok(c, await returnDetailOf(repos, created), 201);
    } catch (cause) {
      return mapReturnCreateSignal(c, cause);
    }
  });

  return router;
}

const SALES_STATUS_FILTER = new Set(['DRAFT', 'SENT', 'PAYMENT_UPLOADED', 'CONFIRMED', 'CANCELLED']);

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

function isScopeOf(scopeUnitId: string | null, unitId: string): boolean {
  return !scopeUnitId || unitId === scopeUnitId;
}

function scopeAllowsOrder(scopeUnitId: string | null, order: SalesOrderRecord): boolean {
  return isScopeOf(scopeUnitId, order.sellerUnitId) || isScopeOf(scopeUnitId, order.buyerUnitId);
}

function isSignal(cause: unknown, marker: string): boolean {
  return cause instanceof Error && cause.message.includes(marker);
}

/** 销售单业务信号 → HTTP 错误（与 shared/src/errors.ts 错误码一致）。 */
function mapSalesSignal(c: Parameters<typeof error>[0], cause: unknown) {
  if (isSignal(cause, 'SALES_STATE_CONFLICT')) {
    return error(c, 409, ErrorCodes.SALES_STATE_CONFLICT, '销售单当前状态不允许该操作');
  }
  if (isSignal(cause, 'SALES_LINE_INVALID')) {
    return error(c, 400, ErrorCodes.SALES_LINE_INVALID, '销售单行无效（批次/数量不匹配）');
  }
  if (isSignal(cause, 'INSUFFICIENT_STOCK')) {
    return error(c, 409, ErrorCodes.INSUFFICIENT_STOCK, '库存不足，无法发送');
  }
  if (isSignal(cause, 'STOCK_BATCH_NOT_FOUND')) {
    return error(c, 409, ErrorCodes.STOCK_BATCH_NOT_FOUND, '指定批次在当前仓库无库存');
  }
  throw cause;
}

/** 创建售后退货单业务信号 → HTTP 错误（与 shared/src/errors.ts 错误码一致）。 */
function mapReturnCreateSignal(c: Parameters<typeof error>[0], cause: unknown) {
  if (isSignal(cause, 'SALES_STATE_CONFLICT')) {
    return error(c, 409, ErrorCodes.SALES_STATE_CONFLICT, '销售单当前状态不允许发起售后');
  }
  if (isSignal(cause, 'RETURN_LINE_INVALID')) {
    return error(c, 400, ErrorCodes.RETURN_LINE_INVALID, '退货行不合法（明细不存在或数量无效）');
  }
  if (isSignal(cause, 'RETURN_QTY_EXCEEDED')) {
    return error(c, 409, ErrorCodes.RETURN_QTY_EXCEEDED, '退货数量超出可退数量');
  }
  throw cause;
}

async function returnDetailOf(repos: Repos, order: ReturnOrderRecord) {
  const [from, to, salesOrder, items] = await Promise.all([
    repos.units.findById(order.fromUnitId),
    repos.units.findById(order.toUnitId),
    order.salesOrderId ? repos.sales.findById(order.salesOrderId) : Promise.resolve(null),
    repos.returns.listItems(order.id),
  ]);
  return {
    ...returnDto(order, {
      fromUnitName: from?.name ?? null,
      toUnitName: to?.name ?? null,
      shipmentNo: null,
      salesOrderNo: salesOrder?.salesNo ?? null,
    }),
    items: items.map(returnItemDto),
  };
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

async function hydrateList(repos: Repos, rows: SalesOrderRecord[]) {
  if (rows.length === 0) return [];
  const unitIds = [
    ...new Set(rows.flatMap((r) => [r.sellerUnitId, r.buyerUnitId])),
  ];
  const units = await Promise.all(unitIds.map((id) => repos.units.findById(id)));
  const nameOf = (id: string) => units.find((u) => u?.id === id)?.name ?? null;
  return rows.map((row) =>
    salesOrderDto(row, { sellerUnitName: nameOf(row.sellerUnitId), buyerUnitName: nameOf(row.buyerUnitId) }),
  );
}

async function detailOf(repos: Repos, order: SalesOrderRecord) {
  const [seller, buyer, items, allocations, payment] = await Promise.all([
    repos.units.findById(order.sellerUnitId),
    repos.units.findById(order.buyerUnitId),
    repos.sales.listItems(order.id),
    repos.sales.listAllocations(order.id),
    repos.sales.findPayment(order.id),
  ]);
  return {
    ...salesOrderDto(order, { sellerUnitName: seller?.name ?? null, buyerUnitName: buyer?.name ?? null }),
    items: items.map(salesOrderItemDto),
    allocations: allocations.map(salesAllocationDto),
    payment: payment ? salesPaymentDto(payment) : null,
  };
}
