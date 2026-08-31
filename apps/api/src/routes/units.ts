import { Permissions } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission, unitScopeFilter } from '../auth/middleware';
import { unitDto } from '../lib/dto';
import { dbUnavailable, ok } from '../lib/http';
import type { AppEnv } from '../types';

// GET /units：登录用户可见的业务单元（design.md §3.2 数据范围）。
export function unitsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requirePermission(Permissions.UNITS_READ));

  router.get('/', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const scope = unitScopeFilter(c.get('auth'));
    const units = await repos.units.list({ scopeUnitId: scope?.unitId });
    return ok(c, units.map(unitDto));
  });

  return router;
}
