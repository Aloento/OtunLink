import {
  migrations as defaultMigrations,
  runMigrations as defaultRunMigrations,
  type Migration,
  type SqlExecutor,
} from '@otunlink/db';
import { ErrorCodes } from '@otunlink/shared';
import { Hono } from 'hono';

import { secureEqual } from '../lib/crypto';
import type { AppEnv } from '../types';

export interface AdminRouterDeps {
  getAdminSecret: (env: AppEnv['Bindings']) => string | undefined;
  getExecutor: (env: AppEnv['Bindings']) => Promise<SqlExecutor | null>;
  runMigrations?: (
    exec: SqlExecutor,
    migrations: readonly Migration[],
  ) => Promise<{ applied: string[]; skipped: string[] }>;
  migrations?: readonly Migration[];
}

export function adminRouter(deps: AdminRouterDeps): Hono<AppEnv> {
  const runMigrationsFn = deps.runMigrations ?? defaultRunMigrations;
  const migrationsList = deps.migrations ?? defaultMigrations;

  const router = new Hono<AppEnv>();

  router.post('/migrate', async (c) => {
    const secret = deps.getAdminSecret(c.env);
    if (!secret) {
      return c.json(
        { error: { code: ErrorCodes.MIGRATION_DISABLED, message: 'ADMIN_SECRET is not configured' } },
        503,
      );
    }

    const headerSecret = c.req.header('X-Admin-Secret');
    if (!headerSecret) {
      return c.json(
        { error: { code: ErrorCodes.UNAUTHORIZED, message: 'Missing X-Admin-Secret header' } },
        401,
      );
    }
    if (!(await secureEqual(headerSecret, secret))) {
      return c.json(
        { error: { code: ErrorCodes.UNAUTHORIZED, message: 'Invalid X-Admin-Secret' } },
        401,
      );
    }

    // bootstrap 阶段（尚无 users 表/记录）允许仅凭 X-Admin-Secret 执行迁移；
    // 若请求已通过鉴权（c.get('auth') 存在），则额外要求 ADMIN 岗位。
    const auth = c.get('auth');
    if (auth?.user && auth.user.role !== 'ADMIN') {
      return c.json(
        { error: { code: ErrorCodes.FORBIDDEN, message: 'ADMIN role required' } },
        403,
      );
    }

    const executor = await deps.getExecutor(c.env);
    if (!executor) {
      return c.json(
        { error: { code: ErrorCodes.MIGRATION_UNAVAILABLE, message: 'Database is not configured' } },
        503,
      );
    }

    try {
      const result = await runMigrationsFn(executor, migrationsList);
      return c.json({ ok: true, applied: result.applied, skipped: result.skipped });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        { error: { code: ErrorCodes.MIGRATION_FAILED, message } },
        500,
      );
    }
  });

  return router;
}
