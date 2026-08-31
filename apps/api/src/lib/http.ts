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

export function unauthorized(c: Ctx, message = 'Unauthorized') {
  return error(c, 401, ErrorCodes.UNAUTHORIZED, message);
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
