import { Hono } from 'hono';

import { requireRole } from '../auth/middleware';
import { createMailer, mailerStatus, resolveConfiguredSender } from '../lib/email';
import { emailParagraph, renderEmailHtml } from '../lib/email-template';
import { dbUnavailable, ok } from '../lib/http';
import type { AppEnv } from '../types';

// 邮件连通性测试：仅 ADMIN；未配置 SMTP 时返回降级原因（200，不抛错）。
// 配置 SMTP 时向系统管理员邮箱发一封测试邮件，成功/失败均如实返回。
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
      return ok(c, { ok: false, provider: status.provider, reason: '未配置 SMTP' });
    }

    const from = resolveConfiguredSender(c.env);
    if (!from) {
      return ok(c, {
        ok: false,
        provider: status.provider,
        reason: '未配置有效的 MAIL_FROM / SMTP_USER（需为真实邮箱地址）',
      });
    }
    try {
      await mailer.send({
        to: from,
        subject: '[OtunLink] 邮件连通性测试',
        text: `这是一封来自 OtunLink 的连通性测试邮件，发送成功即代表邮件配置有效。\n时间：${new Date().toISOString()}`,
        html: renderEmailHtml({
          title: '[OtunLink] 邮件连通性测试',
          headline: '邮件连通性测试',
          body: emailParagraph(
            '这是一封来自 OtunLink 的连通性测试邮件，发送成功即代表邮件配置有效。',
          ),
          cta: { label: '前往工作台', url: 'https://otun.musi.land' },
          timestamp: new Date(),
        }),
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
