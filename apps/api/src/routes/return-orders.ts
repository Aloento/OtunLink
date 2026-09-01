import {
  ErrorCodes,
  Permissions,
  hasPermission,
  returnAcceptSchema,
  returnRejectSchema,
  salesReturnReceiveSchema,
  type ReturnStatus,
} from '@otunlink/shared';
import { Hono } from 'hono';

import { requireAnyPermission, requirePermission, requireUnitScopeAssigned, unitScopeFilter } from '../auth/middleware';
import { createMailer } from '../lib/email';
import { returnDto, returnItemDto } from '../lib/dto';
import { dbUnavailable, error, forbidden, notFound, ok, validationError } from '../lib/http';
import { recordAudit } from '../lib/audit';
import { notify } from '../lib/notify';
import type { AppEnv, Repos, ReturnOrderRecord } from '../types';

// 退货单（design.md §5.2 SHIPMENT 分支 + §5.5 SALES 售后分支）：
// - 读 = SHIPMENT_RETURNS_CREATE（仓库）/ SHIPMENT_RETURNS_HANDLE（集货/管理员）
//   / AFTER_SALE_CREATE（零售）/ AFTER_SALE_RECEIVE（仓库）；
// - SHIPMENT 处理（accept/reject）= SHIPMENT_RETURNS_HANDLE；
// - SALES 处理（approve/reject/receive）= AFTER_SALE_RECEIVE；
//   scope_unit_id 非空时必须等于 to_unit_id（接收方单元）。
export function returnOrdersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requireAnyPermission(
    Permissions.SHIPMENT_RETURNS_CREATE,
    Permissions.SHIPMENT_RETURNS_HANDLE,
    Permissions.AFTER_SALE_CREATE,
    Permissions.AFTER_SALE_RECEIVE,
  );
  const handle = requirePermission(Permissions.SHIPMENT_RETURNS_HANDLE);
  const saleHandle = requireAnyPermission(
    Permissions.SHIPMENT_RETURNS_HANDLE,
    Permissions.AFTER_SALE_RECEIVE,
  );

  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const statusRaw = c.req.query('status')?.trim() ?? '';
    const status = (RETURN_STATUS_FILTER.has(statusRaw) ? statusRaw : undefined) as
      | ReturnStatus
      | undefined;
    const sourceRaw = c.req.query('sourceType')?.trim() ?? '';
    const sourceType = SOURCE_TYPE_FILTER.has(sourceRaw)
      ? (sourceRaw as 'SHIPMENT' | 'SALES')
      : undefined;
    const salesOrderId = c.req.query('salesOrderId')?.trim() || undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));

    const result = await repos.returns.list({
      page,
      size,
      status,
      sourceType,
      salesOrderId,
      scopeUnitId: scope?.unitId,
    });
    const items = await hydrateList(repos, result.items);
    return ok(c, { ...result, items });
  });

  router.get('/:id', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.returns.findById(c.req.param('id'));
    if (!order) return notFound(c, '退货单不存在');

    if (!scopeAllowsRead(c.get('auth').user?.scopeUnitId ?? null, order)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    return ok(c, await detailOf(repos, order));
  });

  router.post('/:id/accept', handle, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.returns.findById(c.req.param('id'));
    if (!order) return notFound(c, '退货单不存在');

    const user = c.get('auth').user!;
    if (!scopeAllowsHandle(user.scopeUnitId, order)) {
      return forbidden(c, '数据范围越界（仅接收方集货可处理退货）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = returnAcceptSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const updated = await repos.returns.accept(order.id, user.id, parsed.data.note ?? null);
      if (!updated) return notFound(c, '退货单不存在');
      await notify(repos, createMailer(c.env), {
        type: 'RETURN_ACCEPTED',
        title: `退货单 ${updated.returnNo} 已确认，请安排退回`,
        content: '集货方已确认收货方的退货申请，请安排退回。',
        link: `/returns/${updated.id}`,
        unitId: updated.fromUnitId,
      });
      await recordAudit(repos, {
        userId: user.id,
        action: 'RETURN_ACCEPT',
        entityType: 'return_order',
        entityId: updated.id,
        before: { status: order.status },
        after: { status: updated.status },
      });
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      if (isReturnAlreadyProcessed(cause)) {
        return error(c, 409, ErrorCodes.RETURN_ALREADY_PROCESSED, '该退货单已被处理，请刷新');
      }
      throw cause;
    }
  });

  router.post('/:id/reject', saleHandle, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.returns.findById(c.req.param('id'));
    if (!order) return notFound(c, '退货单不存在');

    const user = c.get('auth').user!;
    const sourceDenied = requireSourcePermission(c, order);
    if (sourceDenied) return sourceDenied;
    if (!scopeAllowsHandle(user.scopeUnitId, order)) {
      return forbidden(c, '数据范围越界（仅接收方单元可处理退货）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = returnRejectSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const updated =
        order.sourceType === 'SALES'
          ? await repos.returns.rejectSales(order.id, user.id, parsed.data.note)
          : await repos.returns.reject(order.id, user.id, parsed.data.note);
      if (!updated) return notFound(c, '退货单不存在');
      await notify(repos, createMailer(c.env), {
        type: order.sourceType === 'SALES' ? 'AFTER_SALE_REJECTED' : 'RETURN_REJECTED',
        title:
          order.sourceType === 'SALES'
            ? `售后退货单 ${updated.returnNo} 已被驳回`
            : `退货单 ${updated.returnNo} 已被驳回`,
        content: `驳回原因：${parsed.data.note ?? '未填写'}`,
        link: `/returns/${updated.id}`,
        unitId: updated.fromUnitId,
      });
      await recordAudit(repos, {
        userId: user.id,
        action: order.sourceType === 'SALES' ? 'AFTER_SALE_REJECT' : 'RETURN_REJECT',
        entityType: 'return_order',
        entityId: updated.id,
        before: { status: order.status },
        after: { status: updated.status },
      });
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      return mapReturnSignal(c, cause);
    }
  });

  // ── ck-09b：零售售后退货（source_type=SALES）────────────────────────────────
  router.post('/:id/approve', saleHandle, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.returns.findById(c.req.param('id'));
    if (!order) return notFound(c, '退货单不存在');
    if (order.sourceType !== 'SALES') {
      return error(c, 409, ErrorCodes.RETURN_STATE_CONFLICT, '仅销售来源退货单可审批');
    }

    const user = c.get('auth').user!;
    if (!hasPermission(user.role, Permissions.AFTER_SALE_RECEIVE)) {
      return forbidden(c, '缺少权限: after-sale:receive');
    }
    if (!scopeAllowsHandle(user.scopeUnitId, order)) {
      return forbidden(c, '数据范围越界（仅接收方单元可处理退货）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = returnAcceptSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const updated = await repos.returns.approveSales(
        order.id,
        user.id,
        parsed.data.note ?? null,
      );
      if (!updated) return notFound(c, '退货单不存在');
      await notify(repos, createMailer(c.env), {
        type: 'AFTER_SALE_APPROVED',
        title: `售后退货单 ${updated.returnNo} 已审核通过，请寄回`,
        content: '仓库已审核售后申请，请零售方寄回退货。',
        link: `/returns/${updated.id}`,
        unitId: updated.fromUnitId,
      });
      await recordAudit(repos, {
        userId: user.id,
        action: 'AFTER_SALE_APPROVE',
        entityType: 'return_order',
        entityId: updated.id,
        before: { status: order.status },
        after: { status: updated.status },
      });
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      return mapReturnSignal(c, cause);
    }
  });

  router.post('/:id/receive', saleHandle, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const order = await repos.returns.findById(c.req.param('id'));
    if (!order) return notFound(c, '退货单不存在');
    if (order.sourceType !== 'SALES') {
      return error(c, 409, ErrorCodes.RETURN_STATE_CONFLICT, '仅销售来源退货单可收货');
    }

    const user = c.get('auth').user!;
    if (!hasPermission(user.role, Permissions.AFTER_SALE_RECEIVE)) {
      return forbidden(c, '缺少权限: after-sale:receive');
    }
    if (!scopeAllowsHandle(user.scopeUnitId, order)) {
      return forbidden(c, '数据范围越界（仅接收方单元可处理退货）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = salesReturnReceiveSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const updated = await repos.returns.receive(
        order.id,
        user.id,
        parsed.data.items.map((i) => ({
          returnItemId: i.returnItemId,
          receivedQty: i.receivedQty,
        })),
        parsed.data.note ?? null,
      );
      if (!updated) return notFound(c, '退货单不存在');
      await notify(repos, createMailer(c.env), {
        type: 'AFTER_SALE_RETURNED',
        title: `售后退货单 ${updated.returnNo} 已收货完成`,
        content: '仓库已收到退货并完成入库，退款状态请与零售方确认。',
        link: `/returns/${updated.id}`,
        unitId: updated.fromUnitId,
      });
      await recordAudit(repos, {
        userId: user.id,
        action: 'AFTER_SALE_RECEIVE',
        entityType: 'return_order',
        entityId: updated.id,
        before: { status: order.status },
        after: { status: updated.status },
      });
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      return mapReturnSignal(c, cause);
    }
  });

  return router;
}

const RETURN_STATUS_FILTER = new Set([
  'PENDING',
  'CLOSED',
  'REJECTED',
  'REQUESTED',
  'APPROVED',
  'RETURNED',
  'CANCELLED',
]);

const SOURCE_TYPE_FILTER = new Set(['SHIPMENT', 'SALES']);

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function scopeAllowsRead(scopeUnitId: string | null, order: ReturnOrderRecord): boolean {
  if (!scopeUnitId) return true;
  return order.fromUnitId === scopeUnitId || order.toUnitId === scopeUnitId;
}

function scopeAllowsHandle(scopeUnitId: string | null, order: ReturnOrderRecord): boolean {
  return !scopeUnitId || order.toUnitId === scopeUnitId;
}

async function hydrateList(repos: Repos, rows: ReturnOrderRecord[]) {
  if (rows.length === 0) return [];
  const unitIds = [...new Set(rows.flatMap((r) => [r.fromUnitId, r.toUnitId]))];
  const shipmentIds = [...new Set(rows.flatMap((r) => (r.shipmentId ? [r.shipmentId] : [])))];
  const salesOrderIds = [
    ...new Set(rows.flatMap((r) => (r.salesOrderId ? [r.salesOrderId] : []))),
  ];
  const [units, shipments, salesOrders] = await Promise.all([
    Promise.all(unitIds.map((id) => repos.units.findById(id))),
    Promise.all(shipmentIds.map((id) => repos.shipments.findById(id))),
    Promise.all(salesOrderIds.map((id) => repos.sales.findById(id))),
  ]);
  const nameOf = (id: string) => units.find((u) => u?.id === id)?.name ?? null;
  const shipmentNoOf = (id: string | null) =>
    id == null ? null : shipments.find((s) => s?.id === id)?.shipmentNo ?? null;
  const salesOrderNoOf = (id: string | null) =>
    id == null ? null : salesOrders.find((s) => s?.id === id)?.salesNo ?? null;
  return rows.map((row) =>
    returnDto(row, {
      fromUnitName: nameOf(row.fromUnitId),
      toUnitName: nameOf(row.toUnitId),
      shipmentNo: shipmentNoOf(row.shipmentId),
      salesOrderNo: salesOrderNoOf(row.salesOrderId),
    }),
  );
}

async function detailOf(repos: Repos, order: ReturnOrderRecord) {
  const [from, to, shipment, salesOrder, items] = await Promise.all([
    repos.units.findById(order.fromUnitId),
    repos.units.findById(order.toUnitId),
    order.shipmentId ? repos.shipments.findById(order.shipmentId) : Promise.resolve(null),
    order.salesOrderId ? repos.sales.findById(order.salesOrderId) : Promise.resolve(null),
    repos.returns.listItems(order.id),
  ]);
  return {
    ...returnDto(order, {
      fromUnitName: from?.name ?? null,
      toUnitName: to?.name ?? null,
      shipmentNo: shipment?.shipmentNo ?? null,
      salesOrderNo: salesOrder?.salesNo ?? null,
    }),
    items: items.map(returnItemDto),
  };
}

function requireSourcePermission(c: Parameters<typeof forbidden>[0], order: ReturnOrderRecord) {
  const user = c.get('auth').user!;
  if (order.sourceType === 'SALES') {
    if (!hasPermission(user.role, Permissions.AFTER_SALE_RECEIVE)) {
      return forbidden(c, '缺少权限: after-sale:receive');
    }
  } else if (!hasPermission(user.role, Permissions.SHIPMENT_RETURNS_HANDLE)) {
    return forbidden(c, '缺少权限: shipment-returns:handle');
  }
  return null;
}

function isReturnAlreadyProcessed(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('RETURN_ALREADY_PROCESSED');
}
function isReturnStateConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('RETURN_STATE_CONFLICT');
}
function isReturnLineInvalid(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('RETURN_LINE_INVALID');
}
function isReturnQtyExceeded(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('RETURN_QTY_EXCEEDED');
}

/** 退货单业务信号 → HTTP 错误（与 shared/src/errors.ts 错误码一致）。 */
function mapReturnSignal(c: Parameters<typeof error>[0], cause: unknown) {
  if (isReturnAlreadyProcessed(cause)) {
    return error(c, 409, ErrorCodes.RETURN_ALREADY_PROCESSED, '该退货单已被处理，请刷新');
  }
  if (isReturnStateConflict(cause)) {
    return error(c, 409, ErrorCodes.RETURN_STATE_CONFLICT, '退货单当前状态不允许该操作');
  }
  if (isReturnLineInvalid(cause)) {
    return error(c, 400, ErrorCodes.RETURN_LINE_INVALID, '退货行不合法（明细不存在或数量无效）');
  }
  if (isReturnQtyExceeded(cause)) {
    return error(c, 409, ErrorCodes.RETURN_QTY_EXCEEDED, '退货数量超出可退数量');
  }
  throw cause;
}
