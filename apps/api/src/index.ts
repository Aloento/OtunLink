import { ErrorCodes } from '@otunlink/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { authenticate, type AuthDeps } from './auth/middleware';
import { verifyEntraToken } from './auth/verifier';
import { createExecutor } from './db';
import { defaultGetRepos } from './repos';
import { adminRouter } from './routes/admin';
import { adminUnitsRouter } from './routes/admin-units';
import { adminUsersRouter } from './routes/admin-users';
import { authRouter } from './routes/auth';
import { filesRouter } from './routes/files';
import { inboundOrdersRouter } from './routes/inbound-orders';
import { itemsRouter } from './routes/items';
import { returnOrdersRouter } from './routes/return-orders';
import { reviewsRouter } from './routes/reviews';
import { shipmentsRouter } from './routes/shipments';
import { unitsRouter } from './routes/units';
import { usersRouter } from './routes/users';
import type { AppEnv } from './types';

export interface AppDeps extends AuthDeps {}

/**
 * 组装应用（依赖注入便于测试：verifyToken / getRepos 可替换为替身）。
 * - /auth/me、/users/me、/units、/admin/users、/admin/units 走 JWT 鉴权；
 * - /admin/migrate 为 X-Admin-Secret bootstrap（首个迁移前尚无 users 表）。
 */
export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // CORS：SPA 与 API 分离部署（CF Pages + CF Workers），仅放行自有前端域名。
  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173', 'https://otun.musi.land'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
      maxAge: 86400,
    }),
  );

  app.get('/api/v1/health', (c) => c.json({ ok: true }));

  const requireToken = authenticate(deps);

  // 鉴权 + 自动开户
  app.use('/api/v1/auth/*', requireToken);
  app.route('/api/v1/auth', authRouter());

  // 登录用户自助
  app.use('/api/v1/users/*', requireToken);
  app.route('/api/v1/users', usersRouter());

  // 业务单元（登录用户可见范围）
  app.use('/api/v1/units/*', requireToken);
  app.route('/api/v1/units', unitsRouter());

  // 物品目录（登录用户，RBAC 见各路由）
  app.use('/api/v1/items/*', requireToken);
  app.route('/api/v1/items', itemsRouter());

  // 发货单（登录用户，RBAC 见各路由）
  app.use('/api/v1/shipments/*', requireToken);
  app.route('/api/v1/shipments', shipmentsRouter());

  // 差异修订审批（登录用户，RBAC 见各路由）
  app.use('/api/v1/reviews/*', requireToken);
  app.route('/api/v1/reviews', reviewsRouter());

  // 入库单（登录用户，RBAC 见各路由）
  app.use('/api/v1/inbound-orders/*', requireToken);
  app.route('/api/v1/inbound-orders', inboundOrdersRouter());

  // 发货退货单（登录用户，RBAC 见各路由）
  app.use('/api/v1/return-orders/*', requireToken);
  app.route('/api/v1/return-orders', returnOrdersRouter());

  // 图片上传 / 预签名 URL（登录用户，RBAC 见各路由）
  app.use('/api/v1/files/*', requireToken);
  app.route('/api/v1/files', filesRouter());

  // 管理端用户 / 业务单元（JWT + RBAC）
  app.use('/api/v1/admin/users/*', requireToken);
  app.route('/api/v1/admin/users', adminUsersRouter());
  app.use('/api/v1/admin/units/*', requireToken);
  app.route('/api/v1/admin/units', adminUnitsRouter());

  // 迁移 bootstrap（X-Admin-Secret，不依赖 users 表）
  app.route(
    '/api/v1/admin',
    adminRouter({
      getAdminSecret: (env) =>
        typeof env.ADMIN_SECRET === 'string' && env.ADMIN_SECRET.length > 0
          ? env.ADMIN_SECRET
          : undefined,
      getExecutor: createExecutor,
    }),
  );

  app.notFound((c) =>
    c.json({ error: { code: ErrorCodes.NOT_FOUND, message: 'Not found' } }, 404),
  );

  return app;
}

export const defaultApp = createApp({
  verifyToken: verifyEntraToken,
  getRepos: defaultGetRepos,
});

export default defaultApp;
