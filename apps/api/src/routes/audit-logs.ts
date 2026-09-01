import { Permissions } from '@otunlink/shared';
import { Hono } from 'hono';

import { requirePermission } from '../auth/middleware';
import { auditLogDto } from '../lib/dto';
import { dbUnavailable, ok, validationError } from '../lib/http';
import type { AppEnv } from '../types';

// 审计日志查询：仅 ADMIN（AUDIT_ADMIN 权限）。
// 分页 + entityType/entityId/actorId（=用户 id）/from/to（YYYY-MM-DD）筛选。
export function auditLogsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requirePermission(Permissions.AUDIT_ADMIN));

  router.get('/', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 20, 50);
    const entityType = c.req.query('entityType')?.trim() || undefined;
    const entityId = c.req.query('entityId')?.trim() || undefined;
    const actorId = c.req.query('actorId')?.trim() || undefined;
    const from = parseDateParam(c.req.query('from'));
    const to = parseDateParam(c.req.query('to'));
    if (from === null || to === null) {
      return validationError(c, '日期参数不合法（应使用 YYYY-MM-DD）');
    }

    const result = await repos.auditLogs.list({
      page,
      size,
      entityType,
      entityId,
      actorId,
      from,
      to,
    });
    return ok(c, { ...result, items: result.items.map(auditLogDto) });
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

/** 返回 undefined=未传；null=格式非法；字符串=合法日期。 */
function parseDateParam(raw: string | undefined): string | null | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}
