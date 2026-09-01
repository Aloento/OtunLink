import {
  ErrorCodes,
  Permissions,
  outboundCreateSchema,
  type OutboundStatus,
  type OutboundType,
} from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission, requireUnitScopeAssigned, unitScopeFilter } from '../auth/middleware';
import { outboundDto, outboundItemDto } from '../lib/dto';
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
import type { AppEnv, OutboundOrderRecord, Repos, StockBatchRecord } from '../types';

// 手动出库单：DRAFT → POSTED 扣减库存 + 写流水。
// 读 = STOCK_READ（仓库/管理员）；写 = STOCK_WRITE（仓库）。报损（LOSS）同走写权限。
export function outboundOrdersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requirePermission(Permissions.STOCK_READ);
  const write = requirePermission(Permissions.STOCK_WRITE);

  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const statusRaw = c.req.query('status')?.trim() ?? '';
    const status = (OUTBOUND_STATUS_FILTER.has(statusRaw) ? statusRaw : undefined) as
      | OutboundStatus
      | undefined;
    const typeRaw = c.req.query('type')?.trim() ?? '';
    const type = (OUTBOUND_TYPE_FILTER.has(typeRaw) ? typeRaw : undefined) as
      | OutboundType
      | undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));

    const result = await repos.outbounds.list({
      page,
      size,
      status,
      type,
      warehouseUnitId: scope?.unitId,
    });
    const items = await hydrateList(repos, result.items);
    return ok(c, { ...result, items });
  });

  router.post('/', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = outboundCreateSchema.safeParse(body);
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
      await ensureStockAvailable(
        repos,
        input.warehouseUnitId,
        input.lines.map((l) => ({ itemId: l.itemId, qty: String(l.qty), batchId: l.batchId ?? null })),
      );
      const created = await repos.outbounds.create({
        warehouseUnitId: input.warehouseUnitId,
        counterpartyUnitId: input.counterpartyUnitId ?? null,
        type: input.type,
        lossReason: input.lossReason ?? null,
        remark: input.remark ?? null,
        photoFileIds: input.photoFileIds ?? [],
        createdBy: c.get('auth').user!.id,
        lines: input.lines.map((l) => ({
          itemId: l.itemId,
          qty: String(l.qty),
          batchId: l.batchId ?? null,
        })),
      });
      return ok(c, await detailOf(repos, created), 201);
    } catch (cause) {
      if (isSignal(cause, 'INSUFFICIENT_STOCK')) {
        return error(c, 409, ErrorCodes.INSUFFICIENT_STOCK, '库存不足，无法出库');
      }
      throw cause;
    }
  });

  router.patch('/:id', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const outbound = await repos.outbounds.findById(c.req.param('id'));
    if (!outbound) return notFound(c, '出库单不存在');

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, outbound.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');
    const parsed = outboundCreateSchema.safeParse(body);
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
      await ensureStockAvailable(
        repos,
        input.warehouseUnitId,
        input.lines.map((l) => ({ itemId: l.itemId, qty: String(l.qty), batchId: l.batchId ?? null })),
      );
      const updated = await repos.outbounds.update(outbound.id, {
        warehouseUnitId: input.warehouseUnitId,
        counterpartyUnitId: input.counterpartyUnitId ?? null,
        type: input.type,
        lossReason: input.lossReason ?? null,
        remark: input.remark ?? null,
        photoFileIds: input.photoFileIds ?? [],
        lines: input.lines.map((l) => ({
          itemId: l.itemId,
          qty: String(l.qty),
          batchId: l.batchId ?? null,
        })),
      });
      if (!updated) return notFound(c, '出库单不存在');
      await recordAudit(repos, {
        userId: c.get('auth').user!.id,
        action: 'OUTBOUND_UPDATE',
        entityType: 'outbound_order',
        entityId: outbound.id,
        before: { status: outbound.status },
        after: { status: 'DRAFT' },
      });
      return ok(c, await detailOf(repos, updated));
    } catch (cause) {
      if (isSignal(cause, 'OUTBOUND_STATE_CONFLICT')) {
        return error(c, 409, ErrorCodes.OUTBOUND_STATE_CONFLICT, '仅草稿（DRAFT）出库单可编辑');
      }
      if (isSignal(cause, 'INSUFFICIENT_STOCK')) {
        return error(c, 409, ErrorCodes.INSUFFICIENT_STOCK, '库存不足，无法出库');
      }
      throw cause;
    }
  });

  router.get('/:id', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const outbound = await repos.outbounds.findById(c.req.param('id'));
    if (!outbound) return notFound(c, '出库单不存在');

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, outbound.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    return ok(c, await detailOf(repos, outbound));
  });

  router.post('/:id/post', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const outbound = await repos.outbounds.findById(c.req.param('id'));
    if (!outbound) return notFound(c, '出库单不存在');

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, outbound.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    try {
      const posted = await repos.outbounds.post(outbound.id, c.get('auth').user!.id);
      if (!posted) return notFound(c, '出库单不存在');
      await recordAudit(repos, {
        userId: c.get('auth').user!.id,
        action: posted.type === 'LOSS' ? 'OUTBOUND_LOSS_POST' : 'OUTBOUND_POST',
        entityType: 'outbound_order',
        entityId: posted.id,
        before: { status: outbound.status },
        after: { status: posted.status, type: posted.type },
      });
      return ok(c, await detailOf(repos, posted));
    } catch (cause) {
      if (isSignal(cause, 'OUTBOUND_STATE_CONFLICT')) {
        return error(c, 409, ErrorCodes.OUTBOUND_STATE_CONFLICT, '仅草稿（DRAFT）出库单可过账');
      }
      if (isSignal(cause, 'INSUFFICIENT_STOCK')) {
        return error(c, 409, ErrorCodes.INSUFFICIENT_STOCK, '库存不足，无法出库');
      }
      if (isSignal(cause, 'STOCK_BATCH_NOT_FOUND')) {
        return error(c, 409, ErrorCodes.STOCK_BATCH_NOT_FOUND, '指定批次在当前仓库无库存');
      }
      throw cause;
    }
  });

  router.delete('/:id', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const outbound = await repos.outbounds.findById(c.req.param('id'));
    if (!outbound) return notFound(c, '出库单不存在');

    if (!scopeAllows(c.get('auth').user?.scopeUnitId ?? null, outbound.warehouseUnitId)) {
      return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
    }

    try {
      const deleted = await repos.outbounds.delete(outbound.id);
      if (!deleted) return notFound(c, '出库单不存在');
      await recordAudit(repos, {
        userId: c.get('auth').user!.id,
        action: 'OUTBOUND_DELETE',
        entityType: 'outbound_order',
        entityId: outbound.id,
        before: { status: outbound.status },
      });
      return ok(c, { id: outbound.id });
    } catch (cause) {
      if (isSignal(cause, 'OUTBOUND_STATE_CONFLICT')) {
        return error(c, 409, ErrorCodes.OUTBOUND_STATE_CONFLICT, '仅草稿（DRAFT）出库单可删除');
      }
      throw cause;
    }
  });

  return router;
}

const OUTBOUND_STATUS_FILTER = new Set(['DRAFT', 'POSTED']);
const OUTBOUND_TYPE_FILTER = new Set(['NORMAL', 'LOSS']);

function scopeAllows(scopeUnitId: string | null, warehouseUnitId: string): boolean {
  return !scopeUnitId || warehouseUnitId === scopeUnitId;
}

const INSUFFICIENT_STOCK_MESSAGE = 'INSUFFICIENT_STOCK: insufficient stock for outbound';

/**
 * 创建/编辑草稿时校验每行数量不超过可用库存（DRAFT 期间库存仍可能变化，
 * 过账时保留二次校验）。指定 batchId 看该批次可用量；否则看该物品全部批次之和。
 */
async function ensureStockAvailable(
  repos: Repos,
  warehouseUnitId: string,
  lines: { itemId: string; qty: string; batchId: string | null }[],
): Promise<void> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const batchesByItem = new Map<string, StockBatchRecord[]>();
  await Promise.all(
    itemIds.map(async (itemId) => {
      batchesByItem.set(itemId, await repos.stock.listBatches({ unitId: warehouseUnitId, itemId }));
    }),
  );
  for (const line of lines) {
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const batches = batchesByItem.get(line.itemId) ?? [];
    const available = line.batchId
      ? Number(batches.find((b) => b.batchId === line.batchId)?.qty ?? 0)
      : batches.reduce((sum, b) => sum + Number(b.qty), 0);
    if (available < qty) throw new Error(INSUFFICIENT_STOCK_MESSAGE);
  }
}

function isSignal(cause: unknown, marker: string): boolean {
  return cause instanceof Error && cause.message.includes(marker);
}

async function hydrateList(repos: Repos, rows: OutboundOrderRecord[]) {
  if (rows.length === 0) return [];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouseUnitId))];
  const counterpartyIds = [
    ...new Set(rows.flatMap((r) => (r.counterpartyUnitId ? [r.counterpartyUnitId] : []))),
  ];
  const [warehouses, counterparties] = await Promise.all([
    Promise.all(warehouseIds.map((id) => repos.units.findById(id))),
    Promise.all(counterpartyIds.map((id) => repos.units.findById(id))),
  ]);
  const nameOf = (id: string | null) =>
    id == null
      ? null
      : (warehouses.find((u) => u?.id === id)?.name ??
        counterparties.find((u) => u?.id === id)?.name ??
        null);
  return rows.map((row) =>
    outboundDto(row, {
      warehouseName: nameOf(row.warehouseUnitId),
      counterpartyName: nameOf(row.counterpartyUnitId),
    }),
  );
}

async function detailOf(repos: Repos, outbound: OutboundOrderRecord) {
  const [warehouse, counterparty, items] = await Promise.all([
    repos.units.findById(outbound.warehouseUnitId),
    outbound.counterpartyUnitId
      ? repos.units.findById(outbound.counterpartyUnitId)
      : Promise.resolve(null),
    repos.outbounds.listItems(outbound.id),
  ]);
  return {
    ...outboundDto(outbound, {
      warehouseName: warehouse?.name ?? null,
      counterpartyName: counterparty?.name ?? null,
    }),
    items: items.map(outboundItemDto),
  };
}
