import { notificationReadSchema } from '@otunlink/shared';
import { Hono } from 'hono';

import { requireActive } from '../auth/middleware';
import { notificationDto } from '../lib/dto';
import { dbUnavailable, ok, validationError } from '../lib/http';
import type { AppEnv } from '../types';

// 站内通知中心（ck-10 §8.5）：登录用户读取本人/本单元通知 + 未读数 + 批量已读。
// 数据范围：user_id = 本人 或 unit_id = 本人 scope（scope 为空 = 全部单元通知）。
export function notificationsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requireActive());

  router.get('/', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const user = c.get('auth').user!;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const unreadOnly = c.req.query('unreadOnly') === 'true';

    const result = await repos.notifications.listForUser(
      { userId: user.id, unitId: user.scopeUnitId },
      { page, size, unreadOnly },
    );
    return ok(c, { ...result, items: result.items.map(notificationDto) });
  });

  router.get('/unread-count', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const user = c.get('auth').user!;
    const count = await repos.notifications.countUnread({ userId: user.id, unitId: user.scopeUnitId });
    return ok(c, { count });
  });

  router.post('/read', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, '请求体不是合法 JSON');
    }
    const parsed = notificationReadSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, '参数不合法', parsed.error.flatten());
    }

    const user = c.get('auth').user!;
    const updated = await repos.notifications.markRead(
      { userId: user.id, unitId: user.scopeUnitId },
      parsed.data.ids,
    );
    const unread = await repos.notifications.countUnread({ userId: user.id, unitId: user.scopeUnitId });
    return ok(c, { updated, unread });
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
