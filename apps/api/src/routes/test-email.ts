import { Hono } from 'hono';

import { requireRole } from '../auth/middleware';
import { createMailer, mailerStatus } from '../lib/email';
import { dbUnavailable, ok } from '../lib/http';
import type { AppEnv } from '../types';

// 邮件连通性测试（ck-10 §8.8）：仅 ADMIN；未配置桥时返回降级原因（200，不抛错）。
// 配置桥时向系统管理员邮箱发一封测试邮件，成功/失败均如实返回。
export function testEmailRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.use('*', requireRole('ADMIN'));

  router.post('/', async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const status = mailerStatus(c.env);
    if (!status.enabled) {
      return ok(c, { ok: false, provider: status.provider, reason: status.reason });
    }

    const mailer = createMailer(c.env);
    if (!mailer) {
      return ok(c, { ok: false, provider: status.provider, reason: '未配置邮件桥' });
    }

    const from = c.env.MAIL_FROM?.trim() ?? 'otunlink@example.com';
    try {
      await mailer.send({
        to: from,
        subject: '[OtunLink] 邮件桥连通性测试',
        text: `这是一封来自 OtunLink 的连通性测试邮件，发送成功即代表邮件桥配置有效。\n时间：${new Date().toISOString()}`,
      });
      return ok(c, { ok: true, provider: mailer.name, reason: null });
    } catch (cause) {
      return ok(c, {
        ok: false,
        provider: mailer.name,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  });

  return router;
}
