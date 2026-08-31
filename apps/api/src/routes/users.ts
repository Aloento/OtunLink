import { userSelfPatchSchema } from '@otunlink/shared';
import { Hono } from 'hono';

import { requireActive } from '../auth/middleware';
import { publicUserDto } from '../lib/dto';
import { dbUnavailable, forbidden, notFound, ok, validationError } from '../lib/http';
import type { AppEnv } from '../types';

// GET/PATCH /users/me（需 ACTIVE）。
export function usersRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requireActive());

  router.get('/me', async (c) => {
    const user = c.get('auth').user;
    if (!user) return forbidden(c, '用户尚未开通');
    return ok(c, publicUserDto(user));
  });

  router.patch('/me', async (c) => {
    const repos = c.get('repos');
    const user = c.get('auth').user;
    if (!user) return forbidden(c, '用户尚未开通');
    if (!repos) return dbUnavailable(c);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, '请求体不是合法 JSON');
    }
    const parsed = userSelfPatchSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, '参数不合法', parsed.error.flatten());
    }

    const updated = await repos.users.update(user.id, parsed.data);
    if (!updated) return notFound(c, '用户不存在');
    return ok(c, publicUserDto(updated));
  });

  return router;
}
