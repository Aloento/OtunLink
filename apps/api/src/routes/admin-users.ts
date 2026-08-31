import { Permissions, adminUserCreateSchema, adminUserPatchSchema } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission } from '../auth/middleware';
import { adminUserDto } from '../lib/dto';
import { dbUnavailable, notFound, ok, validationError } from '../lib/http';
import type { AppEnv } from '../types';

// 管理端用户路由（design.md §6.2）：分配岗位与数据范围。
export function adminUsersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requirePermission(Permissions.USERS_ADMIN));

  router.get('/', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);
    const users = await repos.users.list();
    return ok(c, users.map(adminUserDto));
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
    const parsed = adminUserCreateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, '参数不合法', parsed.error.flatten());
    }

    try {
      const created = await repos.users.create(parsed.data);
      return ok(c, adminUserDto(created), 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return validationError(c, message);
    }
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
    const parsed = adminUserPatchSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, '参数不合法', parsed.error.flatten());
    }

    const updated = await repos.users.update(id, parsed.data);
    if (!updated) return notFound(c, '用户不存在');
    return ok(c, adminUserDto(updated));
  });

  return router;
}
