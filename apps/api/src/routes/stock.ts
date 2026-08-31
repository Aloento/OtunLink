import { Permissions } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission, unitScopeFilter } from '../auth/middleware';
import { stockMovementDto, stockRowDto } from '../lib/dto';
import { dbUnavailable, ok } from '../lib/http';
import type { AppEnv } from '../types';

// 库存台账（design.md §4.3）：仓库 × 物品 × 批次维度只读查询（STOCK_READ）。
export function stockRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const read = requirePermission(Permissions.STOCK_READ);

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const unitId = c.req.query('unitId')?.trim() ?? undefined;
    const itemId = c.req.query('itemId')?.trim() ?? undefined;
    const batchId = c.req.query('batchId')?.trim() ?? undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));

    const result = await repos.stock.list({
      page,
      size,
      unitId: unitId || scope?.unitId,
      itemId: itemId || undefined,
      batchId: batchId || undefined,
    });
    return ok(c, { ...result, items: result.items.map(stockRowDto) });
  });

  router.get('/movements', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const unitId = c.req.query('unitId')?.trim() ?? undefined;
    const itemId = c.req.query('itemId')?.trim() ?? undefined;
    const batchId = c.req.query('batchId')?.trim() ?? undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const scope = unitScopeFilter(c.get('auth'));

    const result = await repos.stock.listMovements({
      page,
      size,
      unitId: unitId || scope?.unitId,
      itemId: itemId || undefined,
      batchId: batchId || undefined,
    });
    return ok(c, { ...result, items: result.items.map(stockMovementDto) });
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
