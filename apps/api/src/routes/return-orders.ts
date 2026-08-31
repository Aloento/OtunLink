import {
  ErrorCodes,
  Permissions,
  returnAcceptSchema,
  returnRejectSchema,
  type ReturnStatus,
} from '@otunlink/shared';
import { Hono } from 'hono';

import { requireAnyPermission, requirePermission, unitScopeFilter } from '../auth/middleware';
import { returnDto, returnItemDto } from '../lib/dto';
import { dbUnavailable, error, forbidden, notFound, ok, validationError } from '../lib/http';
import type { AppEnv, Repos, ReturnOrderRecord } from '../types';

// 发货退货单（design.md §5.2 SHIPMENT 分支）：
// - 读 = SHIPMENT_RETURNS_CREATE（仓库）或 SHIPMENT_RETURNS_HANDLE（集货/管理员）；
// - 处理（accept/reject）= SHIPMENT_RETURNS_HANDLE；scope_unit_id 非空时必须等于 to_unit_id（集货方）。
export function returnOrdersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requireAnyPermission(
    Permissions.SHIPMENT_RETURNS_CREATE,
    Permissions.SHIPMENT_RETURNS_HANDLE,
  );
  const handle = requirePermission(Permissions.SHIPMENT_RETURNS_HANDLE);

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const statusRaw = c.req.query('status')?.trim() ?? '';
    const status = (RETURN_STATUS_FILTER.has(statusRaw) ? statusRaw : undefined) as
      | ReturnStatus
      | undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));

    const result = await repos.returns.list({ page, size, status, scopeUnitId: scope?.unitId });
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
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      if (isReturnAlreadyProcessed(cause)) {
        return error(c, 409, ErrorCodes.RETURN_ALREADY_PROCESSED, '该退货单已被处理，请刷新');
      }
      throw cause;
    }
  });

  router.post('/:id/reject', handle, async (c) => {
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
    const parsed = returnRejectSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const updated = await repos.returns.reject(order.id, user.id, parsed.data.note);
      if (!updated) return notFound(c, '退货单不存在');
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      if (isReturnAlreadyProcessed(cause)) {
        return error(c, 409, ErrorCodes.RETURN_ALREADY_PROCESSED, '该退货单已被处理，请刷新');
      }
      throw cause;
    }
  });

  return router;
}

const RETURN_STATUS_FILTER = new Set(['PENDING', 'CLOSED', 'REJECTED']);

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
  const [units, shipments] = await Promise.all([
    Promise.all(unitIds.map((id) => repos.units.findById(id))),
    Promise.all(shipmentIds.map((id) => repos.shipments.findById(id))),
  ]);
  const nameOf = (id: string) => units.find((u) => u?.id === id)?.name ?? null;
  const shipmentNoOf = (id: string | null) =>
    id == null ? null : shipments.find((s) => s?.id === id)?.shipmentNo ?? null;
  return rows.map((row) =>
    returnDto(row, {
      fromUnitName: nameOf(row.fromUnitId),
      toUnitName: nameOf(row.toUnitId),
      shipmentNo: shipmentNoOf(row.shipmentId),
    }),
  );
}

async function detailOf(repos: Repos, order: ReturnOrderRecord) {
  const [from, to, shipment, items] = await Promise.all([
    repos.units.findById(order.fromUnitId),
    repos.units.findById(order.toUnitId),
    order.shipmentId ? repos.shipments.findById(order.shipmentId) : Promise.resolve(null),
    repos.returns.listItems(order.id),
  ]);
  return {
    ...returnDto(order, {
      fromUnitName: from?.name ?? null,
      toUnitName: to?.name ?? null,
      shipmentNo: shipment?.shipmentNo ?? null,
    }),
    items: items.map(returnItemDto),
  };
}

function isReturnAlreadyProcessed(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('RETURN_ALREADY_PROCESSED');
}
