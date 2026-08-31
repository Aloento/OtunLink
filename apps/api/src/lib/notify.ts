import type { Repos } from '../types';
import { deliverEmail, type EmailMessage, type EmailProvider } from './email';
import { emailParagraph, renderEmailHtml } from './email-template';

// 关键业务事件接入（ck-10 §8.5）：站内通知为必达（fail-safe），
// 邮件为可选增强（provider 为 null 或未提供收件人时跳过，失败仅记日志不阻断业务）。

export interface NotifyEvent {
  type: string;
  title: string;
  content?: string | null;
  link?: string | null;
  userId?: string | null;
  unitId?: string | null;
  /** 可选：邮件收件人（收到邮件的人，通常与通知对象一致）。 */
  emailTo?: string | null;
  emailSubject?: string | null;
  /** 可同时作为站内通知内容的纯文本（兼容老字段）。 */
  emailText?: string | null;
}

/**
 * 写入站内通知；provider + emailTo 存在时同时发邮件（带日志，1 次重试）。
 * 任何失败只 console.error，不向调用方抛错（不阻断业务过账）。
 */
export async function notify(repos: Repos, mailer: EmailProvider | null, event: NotifyEvent): Promise<void> {
  try {
    await repos.notifications.create({
      userId: event.userId ?? null,
      unitId: event.unitId ?? null,
      type: event.type,
      title: event.title,
      content: event.content ?? null,
      link: event.link ?? null,
    });
  } catch (err) {
    console.error('[notify] 站内通知写入失败', event.type, err);
  }
  if (!mailer || !event.emailTo) return;
  const msg: EmailMessage = {
    to: event.emailTo,
    subject: event.emailSubject ?? event.title,
    text: event.emailText ?? event.content ?? event.title,
    html: renderEmailHtml({
      title: event.emailSubject ?? event.title,
      headline: event.title,
      body:
        emailParagraph(event.emailText ?? event.content) +
        (event.link
          ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">点击下方按钮查看详情：</p>`
          : ''),
      cta: event.link ? { label: '查看详情', url: event.link } : undefined,
      timestamp: new Date(),
    }),
  };
  try {
    const result = await deliverEmail(repos, mailer, msg);
    if (!result.ok) console.error('[notify] 邮件发送失败', event.type, result.error);
  } catch (err) {
    console.error('[notify] 邮件日志写入失败', event.type, err);
  }
}
