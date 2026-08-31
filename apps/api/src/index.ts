import { ErrorCodes } from '@otunlink/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { authenticate, type AuthDeps } from './auth/middleware';
import { verifyEntraToken } from './auth/verifier';
import { createExecutor } from './db';
import { createMailer, deliverEmail } from './lib/email';
import { emailParagraph, renderEmailHtml } from './lib/email-template';
import { runExpiryScan } from './lib/expiry-scan';
import { createSqlRepos, defaultGetRepos } from './repos';
import { adminRouter } from './routes/admin';
import { adminUnitsRouter } from './routes/admin-units';
import { adminUsersRouter } from './routes/admin-users';
import { auditLogsRouter } from './routes/audit-logs';
import { authRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { filesRouter } from './routes/files';
import { inboundOrdersRouter } from './routes/inbound-orders';
import { itemsRouter } from './routes/items';
import { notificationsRouter } from './routes/notifications';
import { outboundOrdersRouter } from './routes/outbound-orders';
import { retailPricesRouter } from './routes/retail-prices';
import { returnOrdersRouter } from './routes/return-orders';
import { reviewsRouter } from './routes/reviews';
import { salesOrdersRouter } from './routes/sales-orders';
import { shipmentsRouter } from './routes/shipments';
import { stockRouter } from './routes/stock';
import { testEmailRouter } from './routes/test-email';
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

  // 手动出库单（登录用户，RBAC 见各路由）
  app.use('/api/v1/outbound-orders/*', requireToken);
  app.route('/api/v1/outbound-orders', outboundOrdersRouter());

  // 库存台账（登录用户，RBAC 见各路由）
  app.use('/api/v1/stock/*', requireToken);
  app.route('/api/v1/stock', stockRouter());

  // 零售价管理（登录用户，RBAC 见各路由）
  app.use('/api/v1/retail-prices/*', requireToken);
  app.route('/api/v1/retail-prices', retailPricesRouter());

  // 销售单（请货/主动送货，RBAC 见各路由）
  app.use('/api/v1/sales-orders/*', requireToken);
  app.route('/api/v1/sales-orders', salesOrdersRouter());

  // 图片上传 / 预签名 URL（登录用户，RBAC 见各路由）
  app.use('/api/v1/files/*', requireToken);
  app.route('/api/v1/files', filesRouter());

  // 管理端用户 / 业务单元（JWT + RBAC）
  app.use('/api/v1/admin/users/*', requireToken);
  app.route('/api/v1/admin/users', adminUsersRouter());
  app.use('/api/v1/admin/units/*', requireToken);
  app.route('/api/v1/admin/units', adminUnitsRouter());

  // 通知中心（ck-10 §8.5）：本人 + 所属 scope 可见
  app.use('/api/v1/notifications/*', requireToken);
  app.route('/api/v1/notifications', notificationsRouter());

  // 工作台待办聚合（ck-10 §8.5）
  app.use('/api/v1/dashboard/*', requireToken);
  app.route('/api/v1/dashboard', dashboardRouter());

  // 管理端审计日志 / 邮件测试（ADMIN）
  app.use('/api/v1/admin/audit-logs/*', requireToken);
  app.route('/api/v1/admin/audit-logs', auditLogsRouter());
  app.use('/api/v1/admin/test-email/*', requireToken);
  app.route('/api/v1/admin/test-email', testEmailRouter());

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

/**
 * 每日效期预警 cron（ck-08b）：扫描 7 天内到期 + 已过期批次，写 notifications 表。
 * 失败仅记录日志，不影响 Worker 调度。
 */
export async function scheduled(
  event: { cron: string },
  env: Record<string, unknown>,
  ctx: { waitUntil: (promise: Promise<unknown>) => void },
) {
  const exec = await createExecutor(env);
  if (!exec) {
    console.error('[scheduled] DB unavailable, expiry scan skipped');
    return;
  }
  try {
    const repos = createSqlRepos(exec);
    const result = await runExpiryScan(repos);
    console.log(
      `[scheduled] expiry scan done: created=${result.createdCount} expiring=${result.expiringCount} expired=${result.expiredCount}`,
    );

    // ck-10 §8.8：配置了邮件桥时，将效期预警邮件发给对应仓库的活跃用户（无桥则跳过）。
    const mailer = createMailer(env as unknown as AppEnv);
    if (mailer && result.alerts.length > 0) {
      const users = await repos.users.list();
      let sent = 0;
      for (const alert of result.alerts) {
        const recipients = users.filter(
          (u) =>
            u.status === 'ACTIVE' &&
            (u.scopeUnitId === alert.unitId || u.role === 'ADMIN'),
        );
        for (const user of recipients) {
          const outcome = await deliverEmail(repos, mailer, {
            to: user.email,
            subject: `[OtunLink] ${alert.title}`,
            text: `${alert.content}\n所属单元：${alert.unitName ?? '-'}`,
            html: renderEmailHtml({
              title: `[OtunLink] ${alert.title}`,
              headline: alert.title,
              body:
                emailParagraph(alert.content) +
                emailParagraph(`所属单元：${alert.unitName ?? '-'}`),
              cta: { label: '前往处理', url: 'https://musi.land' },
              timestamp: new Date(),
            }),
          });
          if (outcome.ok) sent += 1;
          else console.error('[scheduled] expiry alert email failed:', outcome.error);
        }
      }
      console.log(`[scheduled] expiry alert emails sent: ${sent}`);
    }
  } catch (cause) {
    console.error('[scheduled] expiry scan failed:', cause);
  }
}
