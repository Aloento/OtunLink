import { ErrorCodes, Permissions, type InboundStatus } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission, unitScopeFilter } from '../auth/middleware';
import { inboundDto, inboundItemDto } from '../lib/dto';
import { dbUnavailable, error, forbidden, notFound, ok } from '../lib/http';
import type { AppEnv, InboundOrderRecord, Repos } from '../types';

// 入库单（design.md §5.3）：确认收货自动生成的 DRAFT 在 POST 后建档批次 +
// 写库存/台账。读 = STOCK_READ（仓库/管理员）；POST = INBOUND_CONFIRM（仓库）。
export function inboundOrdersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requirePermission(Permissions.STOCK_READ);
  const post = requirePermission(Permissions.INBOUND_CONFIRM);

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const statusRaw = c.req.query('status')?.trim() ?? '';
    const status = (INBOUND_STATUS_FILTER.has(statusRaw) ? statusRaw : undefined) as
      | InboundStatus
      | undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));

    const result = await repos.inbounds.list({
      page,
      size,
      status,
      warehouseUnitId: scope?.unitId,
    });
    const items = await hydrateList(repos, result.items);
    return ok(c, { ...result, items });
  });

  router.get('/:id', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const inbound = await repos.inbounds.findById(c.req.param('id'));
    if (!inbound) return notFound(c, '入库单不存在');

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, inbound.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    return ok(c, await detailOf(repos, inbound));
  });

  router.post('/:id/post', post, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const inbound = await repos.inbounds.findById(c.req.param('id'));
    if (!inbound) return notFound(c, '入库单不存在');

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, inbound.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    try {
      const posted = await repos.inbounds.post(inbound.id, c.get('auth').user!.id);
      if (!posted) return notFound(c, '入库单不存在');
      return ok(c, await detailOf(repos, posted));
    } catch (cause) {
      if (isInboundStateConflict(cause)) {
        return error(c, 409, ErrorCodes.INBOUND_STATE_CONFLICT, '仅草稿（DRAFT）入库单可过账');
      }
      throw cause;
    }
  });

  return router;
}

const INBOUND_STATUS_FILTER = new Set(['DRAFT', 'POSTED']);

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

function scopeAllows(scopeUnitId: string | null, warehouseUnitId: string): boolean {
  return !scopeUnitId || warehouseUnitId === scopeUnitId;
}

async function hydrateList(repos: Repos, rows: InboundOrderRecord[]) {
  if (rows.length === 0) return [];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouseUnitId))];
  const counterpartyIds = [
    ...new Set(rows.flatMap((r) => (r.counterpartyUnitId ? [r.counterpartyUnitId] : []))),
  ];
  const shipmentIds = [...new Set(rows.flatMap((r) => (r.shipmentId ? [r.shipmentId] : [])))];
  const [warehouses, counterparties, shipments] = await Promise.all([
    Promise.all(warehouseIds.map((id) => repos.units.findById(id))),
    Promise.all(counterpartyIds.map((id) => repos.units.findById(id))),
    Promise.all(shipmentIds.map((id) => repos.shipments.findById(id))),
  ]);
  const nameOf = (id: string | null) =>
    id == null
      ? null
      : (warehouses.find((u) => u?.id === id)?.name ??
        counterparties.find((u) => u?.id === id)?.name ??
        null);
  const shipmentNoOf = (id: string | null) =>
    id == null ? null : shipments.find((s) => s?.id === id)?.shipmentNo ?? null;
  return rows.map((row) =>
    inboundDto(row, {
      warehouseName: nameOf(row.warehouseUnitId),
      counterpartyName: nameOf(row.counterpartyUnitId),
      shipmentNo: shipmentNoOf(row.shipmentId),
    }),
  );
}

async function detailOf(repos: Repos, inbound: InboundOrderRecord) {
  const [warehouse, counterparty, shipment, items] = await Promise.all([
    repos.units.findById(inbound.warehouseUnitId),
    inbound.counterpartyUnitId ? repos.units.findById(inbound.counterpartyUnitId) : Promise.resolve(null),
    inbound.shipmentId ? repos.shipments.findById(inbound.shipmentId) : Promise.resolve(null),
    repos.inbounds.listItems(inbound.id),
  ]);
  return {
    ...inboundDto(inbound, {
      warehouseName: warehouse?.name ?? null,
      counterpartyName: counterparty?.name ?? null,
      shipmentNo: shipment?.shipmentNo ?? null,
    }),
    items: items.map(inboundItemDto),
  };
}

function isInboundStateConflict(cause: unknown): boolean {
  return cause instanceof Error && cause.message.includes('INBOUND_STATE_CONFLICT');
}
