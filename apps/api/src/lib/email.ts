import type { Env, Repos } from '../types';

// 邮件桥（design.md §8.8）：EmailProvider 抽象 + 适配器工厂 + 带日志的投递。
// 未配置桥时 createMailer 返回 null → 业务降级为仅站内通知（email_logs 不写）。

export interface EmailMessage {
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

export interface EmailDeliveryResult {
  ok: boolean;
  logId: string;
  attempts: number;
  error: string | null;
}

/** 邮件桥适配器：POST {BRIDGE_URL}/send，X-API-KEY 鉴权（infra/mail-bridge）。 */
function createBridgeProvider(env: Env): EmailProvider | null {
  const url = env.BRIDGE_URL?.trim() ?? '';
  const key = env.BRIDGE_API_KEY?.trim() ?? '';
  if (!url || !key) return null;
  const from = env.MAIL_FROM?.trim() ?? null;
  return {
    name: 'bridge',
    async send(msg) {
      const res = await fetch(url.replace(/\/+$/, '') + '/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          ...(from ? { 'x-mail-from': from } : {}),
        },
        body: JSON.stringify({
          to: msg.to,
          subject: msg.subject,
          text: msg.text ?? null,
          html: msg.html ?? null,
        }),
      });
      if (!res.ok) {
        throw new Error(`mail-bridge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    },
  };
}

/** 内部 API 发送器（预留）：未配置，调用即抛错（正常路径不会走到）。 */
function createApiProvider(_env: Env): EmailProvider {
  return {
    name: 'api',
    async send() {
      throw new Error('MAIL_PROVIDER=api 尚未实现（预留），请配置 BRIDGE_URL/BRIDGE_API_KEY');
    },
  };
}

/**
 * SMTP 直连适配器（ck-11 §8.8）：经 Cloudflare Workers `connect()`（TCP socket）直连外部 SMTP。
 * 依赖 worker-mailer（内部用 cloudflare:sockets），支持：
 * - 端口 465（隐式 TLS）：`secure: true`（SMTP_SECURE=true），connect secureTransport=on。
 * - 端口 587（STARTTLS）：`secure: false, startTls: true`（默认）。
 * 注意：Workers 无法出站端口 25，只能走 465/587。
 */
function createSmtpProvider(env: Env): EmailProvider {
  const host = env.SMTP_HOST?.trim() ?? '';
  const port = Number(env.SMTP_PORT ?? 465);
  const user = env.SMTP_USER?.trim() ?? '';
  const pass = env.SMTP_PASS ?? '';
  const from = env.MAIL_FROM?.trim() || user;
  const secure = env.SMTP_SECURE?.trim() === 'true' || port === 465;
  const startTls = env.SMTP_STARTTLS?.trim() !== 'false' && !secure;
  const authType = (env.SMTP_AUTH?.trim() as 'plain' | 'login' | undefined) ?? 'plain';

  return {
    name: 'smtp',
    async send(msg) {
      // 动态 import：worker-mailer 依赖 cloudflare:sockets，仅在真正发信时加载，
      // 避免在 Node（vitest）环境下静态引入导致测试崩溃。
      const { WorkerMailer } = await import('worker-mailer');
      await WorkerMailer.send(
        { host, port, secure, startTls, credentials: { username: user, password: pass }, authType },
        {
          from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text ?? undefined,
          html: msg.html ?? undefined,
        },
      );
    },
  };
}

/**
 * 按环境变量组装邮件提供者；无有效配置返回 null（降级为仅站内通知）。
 * MAIL_PROVIDER=bridge（默认值）: 需 BRIDGE_URL + BRIDGE_API_KEY。
 * MAIL_PROVIDER=api: 预留，未实现。
 */
export function createMailer(env: Env | undefined): EmailProvider | null {
  const cfg = env ?? ({} as Env);
  const provider = (cfg.MAIL_PROVIDER ?? 'bridge').trim().toLowerCase();
  if (provider === 'api') return createApiProvider(cfg);
  if (provider === 'smtp') {
    if (!cfg.SMTP_HOST?.trim() || !cfg.SMTP_USER?.trim()) return null;
    return createSmtpProvider(cfg);
  }
  return createBridgeProvider(cfg);
}

/** 邮件能力状态（供 /admin/test-email 与文档说明使用）。 */
export function mailerStatus(env: Env | undefined): { enabled: boolean; provider: string | null; reason: string | null } {
  const cfg = env ?? ({} as Env);
  const provider = (cfg.MAIL_PROVIDER ?? 'bridge').trim().toLowerCase();
  if (provider === 'api') {
    return { enabled: false, provider: 'api', reason: 'MAIL_PROVIDER=api 为预留适配器，尚未实现' };
  }
  if (provider === 'smtp') {
    if (!cfg.SMTP_HOST?.trim()) {
      return { enabled: false, provider: 'smtp', reason: '未配置 SMTP_HOST' };
    }
    if (!cfg.SMTP_USER?.trim()) {
      return { enabled: false, provider: 'smtp', reason: '未配置 SMTP_USER' };
    }
    if (!cfg.SMTP_PASS) {
      return { enabled: false, provider: 'smtp', reason: '未配置 SMTP_PASS' };
    }
    return { enabled: true, provider: 'smtp', reason: null };
  }
  if (!cfg.BRIDGE_URL?.trim()) {
    return { enabled: false, provider: 'bridge', reason: '未配置 BRIDGE_URL' };
  }
  if (!cfg.BRIDGE_API_KEY?.trim()) {
    return { enabled: false, provider: 'bridge', reason: '未配置 BRIDGE_API_KEY' };
  }
  return { enabled: true, provider: 'bridge', reason: null };
}

/**
 * 发送一封邮件并记录 email_logs：PENDING → 发送（默认重试 1 次）→ SENT/FAILED。
 * 返回日志 id 与尝试次数；调用方决定是否忽略失败（fail-safe 原则：通知兜底）。
 */
export async function deliverEmail(
  repos: Repos,
  provider: EmailProvider,
  msg: EmailMessage,
  options: { retries?: number } = {},
): Promise<EmailDeliveryResult> {
  const retries = Math.max(options.retries ?? 1, 0);
  const log = await repos.emailLogs.create({
    toAddress: msg.to,
    subject: msg.subject,
    body: msg.text ?? msg.html ?? null,
    provider: provider.name,
  });
  let attempts = 0;
  let lastError: string | null = null;
  for (let i = 0; i <= retries; i += 1) {
    attempts += 1;
    try {
      await provider.send(msg);
      await repos.emailLogs.markResult(log.id, { status: 'SENT', sentAt: new Date(), attempts });
      return { ok: true, logId: log.id, attempts, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  await repos.emailLogs.markResult(log.id, { status: 'FAILED', error: lastError, attempts });
  return { ok: false, logId: log.id, attempts, error: lastError };
}
