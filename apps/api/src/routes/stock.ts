import { Permissions } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission, requireUnitScopeAssigned, unitScopeFilter } from '../auth/middleware';
import { stockBatchDto, stockMovementDto, stockRowDto } from '../lib/dto';
import { dbUnavailable, notFound, ok, validationError } from '../lib/http';
import { resolvePartnerWarehouseScope } from '../lib/partnerships';
import type { AppEnv } from '../types';

// 库存台账（design.md §4.3）：仓库 × 物品 × 批次维度只读查询（STOCK_READ）。
export function stockRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const read = requirePermission(Permissions.STOCK_READ);

  // 非 ADMIN 必须绑定业务单元才能访问业务数据（ADMIN 空 scope = 全量）。
  router.use('*', requireUnitScopeAssigned());

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const unitId = c.req.query('unitId')?.trim() ?? undefined;
    const itemId = c.req.query('itemId')?.trim() ?? undefined;
    const batchId = c.req.query('batchId')?.trim() ?? undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);

    // RETAILER 仅可见已签约仓库；其它角色按 scope 收敛。
    const scope = await resolvePartnerWarehouseScope(c, repos, unitId);
    if (scope.denied) return notFound(c, '仓库不存在或未与您的门店签约');

    const result = await repos.stock.list({
      page,
      size,
      unitId: scope.unitId,
      unitIds: scope.unitIds,
      itemId: itemId || undefined,
      batchId: batchId || undefined,
    });
    const hideCost = c.get('auth').user?.role === 'RETAILER';
    return ok(c, {
      ...result,
      items: result.items.map((row) => stockRowDto(row, { hideCost })),
    });
  });

  router.get('/movements', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const unitId = c.req.query('unitId')?.trim() ?? undefined;
    const itemId = c.req.query('itemId')?.trim() ?? undefined;
    const batchId = c.req.query('batchId')?.trim() ?? undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);

    const scope = await resolvePartnerWarehouseScope(c, repos, unitId);
    if (scope.denied) return notFound(c, '仓库不存在或未与您的门店签约');

    const result = await repos.stock.listMovements({
      page,
      size,
      unitId: scope.unitId,
      unitIds: scope.unitIds,
      itemId: itemId || undefined,
      batchId: batchId || undefined,
    });
    const hideCost = c.get('auth').user?.role === 'RETAILER';
    return ok(c, {
      ...result,
      items: result.items.map((row) => stockMovementDto(row, { hideCost })),
    });
  });

  // 效期视图（ck-08b）：全部有库存批次 + 剩余天数；已过期（remainingDays < 0）。
  router.get('/batches', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const unitId = c.req.query('unitId')?.trim() ?? undefined;
    const itemId = c.req.query('itemId')?.trim() ?? undefined;

    const scope = await resolvePartnerWarehouseScope(c, repos, unitId);
    if (scope.denied) return notFound(c, '仓库不存在或未与您的门店签约');

    const items = await repos.stock.listBatches({
      unitId: scope.unitId,
      unitIds: scope.unitIds,
      itemId: itemId || undefined,
    });
    const hideCost = c.get('auth').user?.role === 'RETAILER';
    return ok(c, { items: items.map((row) => stockBatchDto(row, { hideCost })) });
  });

  // 已过期批次（ck-08b）：必须指定 unitId，或按 scope 收敛（RETAILER 不附加自身门店，须显式给 unitId）。
  router.get('/expired', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const rawUnitId = c.req.query('unitId')?.trim() ?? undefined;
    const user = c.get('auth').user!;
    if (user.role === 'RETAILER') {
      if (!rawUnitId) return validationError(c, 'unitId is required');
      const scope = await resolvePartnerWarehouseScope(c, repos, rawUnitId);
      if (scope.denied) return notFound(c, '仓库不存在或未与您的门店签约');
      const items = await repos.stock.listExpired({ unitId: scope.unitId });
      const hideCost = true;
      return ok(c, { items: items.map((row) => stockBatchDto(row, { hideCost })) });
    }

    const scope = unitScopeFilter(c.get('auth'));
    const unitId = rawUnitId || scope?.unitId;
    if (!unitId) return validationError(c, 'unitId is required');

    const items = await repos.stock.listExpired({ unitId });
    const hideCost = false;
    return ok(c, { items: items.map((row) => stockBatchDto(row, { hideCost })) });
  });

  return router;
}

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}
