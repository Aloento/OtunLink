import type { Context } from 'hono';
import { ErrorCodes } from '@otunlink/shared';

import type { AppEnv } from '../types';

type Ctx = Context<AppEnv>;

export function ok(c: Ctx, data: unknown, status = 200) {
  return c.json({ data }, status as 200);
}

export function error(
  c: Ctx,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: Record<string, unknown> = { error: { code, message } };
  if (details !== undefined) body.error = { ...(body.error as object), details };
  return c.json(body, status as 200);
}

export function forbidden(c: Ctx, message = 'Forbidden') {
  return error(c, 403, ErrorCodes.FORBIDDEN, message);
}

export function notFound(c: Ctx, message = 'Not found') {
  return error(c, 404, ErrorCodes.NOT_FOUND, message);
}

export function validationError(c: Ctx, message: string, details?: unknown) {
  return error(c, 400, ErrorCodes.VALIDATION_ERROR, message, details);
}

export function dbUnavailable(c: Ctx) {
  return error(c, 503, ErrorCodes.DATABASE_UNAVAILABLE, 'Database is not configured');
}

/**
 * 把驱动错误压成一行可外发的诊断串：抹掉连接串里的口令、截断长度。
 * 只服务于「出问题时能看见真实原因」，完整堆栈交给 console.error。
 */
export function describeDbError(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const masked = raw.replace(/(postgres(?:ql)?:\/\/)[^@\s]*@/gi, '$1***@');
  const code = (cause as { code?: unknown })?.code;
  const prefix = typeof code === 'string' && code.length > 0 ? `[${code}] ` : '';
  return `${prefix}${masked}`.slice(0, 200);
}

/** 数据库查询期异常：503 + DATABASE_UNAVAILABLE + 清洗后的原因（前端可据此显示可复制的诊断信息）。 */
export function dbQueryFailed(c: Ctx, cause: unknown, scope = '数据库查询失败') {
  return error(c, 503, ErrorCodes.DATABASE_UNAVAILABLE, `${scope}：${describeDbError(cause)}`);
}

export function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

export async function readJson(c: Ctx): Promise<unknown | undefined> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
