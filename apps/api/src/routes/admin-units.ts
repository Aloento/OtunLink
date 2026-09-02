import { ErrorCodes, Permissions, unitCreateSchema, unitPatchSchema } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission } from '../auth/middleware';
import { unitDto } from '../lib/dto';
import { dbUnavailable, error, notFound, ok, validationError } from '../lib/http';
import type { AppEnv } from '../types';

// 管理端业务单元 CRUD。
export function adminUnitsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requirePermission(Permissions.UNITS_ADMIN));

  router.get('/', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);
    const units = await repos.units.list({ includeInactive: true });
    return ok(c, units.map(unitDto));
  });

  router.post('/', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, '请求体不是合法 JSON');
    }
    const parsed = unitCreateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, '参数不合法', parsed.error.flatten());
    }

    const created = await repos.units.create(parsed.data);
    return ok(c, unitDto(created), 201);
  });

  router.patch('/:id', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);
    const id = c.req.param('id');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, '请求体不是合法 JSON');
    }
    const parsed = unitPatchSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, '参数不合法', parsed.error.flatten());
    }

    const updated = await repos.units.update(id, parsed.data);
    if (!updated) return notFound(c, '业务单元不存在');
    return ok(c, unitDto(updated));
  });

  router.delete('/:id', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const id = c.req.param('id');
    const unit = await repos.units.findById(id);
    if (!unit) return notFound(c, '业务单元不存在');

    const hasReferences = await repos.units.hasReferences(id);
    if (hasReferences) {
      return error(c, 409, ErrorCodes.UNIT_IN_USE, '该业务单元已被单据/库存/用户范围引用，无法删除');
    }

    const deleted = await repos.units.delete(id);
    if (!deleted) return notFound(c, '业务单元不存在');
    return ok(c, { id });
  });

  return router;
}
