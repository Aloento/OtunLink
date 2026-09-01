import { ErrorCodes, Permissions, inboundManualCreateSchema, type InboundStatus } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission, requireUnitScopeAssigned, unitScopeFilter } from '../auth/middleware';
import { inboundDto, inboundItemDto } from '../lib/dto';
import {
  dbUnavailable,
  error,
  forbidden,
  notFound,
  ok,
  parsePositiveInt,
  readJson,
  validationError,
} from '../lib/http';
import { recordAudit } from '../lib/audit';
import type { AppEnv, InboundOrderRecord, Repos } from '../types';

// 入库单：确认收货自动生成的 DRAFT 在 POST 后建档批次并
// 写库存/台账。读 = STOCK_READ（仓库/管理员）；POST = INBOUND_CONFIRM（仓库）。
export function inboundOrdersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requirePermission(Permissions.STOCK_READ);
  const post = requirePermission(Permissions.INBOUND_CONFIRM);

  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

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

  router.post('/', post, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = inboundManualCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());
    const input = parsed.data;

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, input.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const [warehouse, counterparty] = await Promise.all([
      repos.units.findById(input.warehouseUnitId),
      input.counterpartyUnitId
        ? repos.units.findById(input.counterpartyUnitId)
        : Promise.resolve(null),
    ]);
    if (!warehouse || warehouse.type !== 'WAREHOUSE') {
      return validationError(c, '仓库不存在或不是仓库类型', {
        warehouseUnitId: input.warehouseUnitId,
      });
    }
    if (input.counterpartyUnitId && !counterparty) {
      return validationError(c, '交易对手业务单元不存在', {
        counterpartyUnitId: input.counterpartyUnitId,
      });
    }

    const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
    const items = await Promise.all(itemIds.map((id) => repos.items.findById(id)));
    const found = new Set(items.filter((i) => i).map((i) => i!.id));
    const missing = itemIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return validationError(c, '部分物品不存在', { itemIds: missing });
    }

    try {
      const created = await repos.inbounds.createManual({
        warehouseUnitId: input.warehouseUnitId,
        counterpartyUnitId: input.counterpartyUnitId ?? null,
        remark: input.remark ?? null,
        photoFileIds: input.photoFileIds ?? [],
        createdBy: c.get('auth').user!.id,
        lines: input.lines.map((l) => ({
          itemId: l.itemId,
          qty: String(l.qty),
          unitCost: l.unitCost != null ? String(l.unitCost) : '0',
          productionDate: l.productionDate ? String(l.productionDate) : null,
          expiryDate: l.expiryDate ? String(l.expiryDate) : null,
          batchNo: l.batchNo ?? null,
          lineNote: l.lineNote ?? null,
        })),
      });
      return ok(c, await detailOf(repos, created), 201);
    } catch (cause) {
      throw cause;
    }
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
      await recordAudit(repos, {
        userId: c.get('auth').user!.id,
        action: 'INBOUND_POST',
        entityType: 'inbound_order',
        entityId: posted.id,
        before: { status: inbound.status },
        after: { status: posted.status },
      });
      return ok(c, await detailOf(repos, posted));
    } catch (cause) {
      if (isInboundStateConflict(cause)) {
        return error(c, 409, ErrorCodes.INBOUND_STATE_CONFLICT, '仅草稿（DRAFT）入库单可过账');
      }
      throw cause;
    }
  });

  router.delete('/:id', post, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const inbound = await repos.inbounds.findById(c.req.param('id'));
    if (!inbound) return notFound(c, '入库单不存在');

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, inbound.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    try {
      const deleted = await repos.inbounds.delete(inbound.id);
      if (!deleted) return notFound(c, '入库单不存在');
      await recordAudit(repos, {
        userId: c.get('auth').user!.id,
        action: 'INBOUND_DELETE',
        entityType: 'inbound_order',
        entityId: inbound.id,
        before: { status: inbound.status },
      });
      return ok(c, { id: inbound.id });
    } catch (cause) {
      if (isInboundStateConflict(cause)) {
        return error(c, 409, ErrorCodes.INBOUND_STATE_CONFLICT, '仅草稿（DRAFT）入库单可删除');
      }
      throw cause;
    }
  });

  return router;
}

const INBOUND_STATUS_FILTER = new Set(['DRAFT', 'POSTED']);

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
