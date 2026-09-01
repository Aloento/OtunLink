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
