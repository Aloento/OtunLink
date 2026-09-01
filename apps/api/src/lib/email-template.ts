// 邮件 HTML 模板：自适应屏幕大小的品牌化邮件外壳。
// 采用 table 布局 + 内联样式，并在 <style> 中加媒体查询做窄屏适配（对多数邮件客户端兼容）。

/** 转义 HTML 文本，防止邮件中注入非预期标记。 */
export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface EmailTemplateOptions {
  /** 用于 <title> 与 preheader 的主题。 */
  title: string;
  /** 内容区主标题（加粗，email 主题一致）。 */
  headline?: string;
  /** 内容区正文（可为若干 HTML 块/段落）。 */
  body?: string;
  /** 可选主行动按钮。 */
  cta?: { label: string; url: string };
  /** 页脚说明文字（默认显示品牌名与时间）。 */
  footer?: string;
  /** 邮件生成时间。 */
  timestamp?: Date | string | number;
}

/** 段落文本（转义 + 包装为 <p>）。 */
export function emailParagraph(text: string | null | undefined): string {
  if (!text) return '';
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(text)}</p>`;
}

/** 主行动按钮（仅 <a>，配内联样式，让多数客户端可点击）。 */
function emailButton(label: string, url: string): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">',
    '<tr><td align="center" style="border-radius:8px;background-color:#2563eb;">',
    `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>`,
    '</td></tr></table>',
  ].join('');
}

/** 渲染品牌化自适应邮件 HTML。 */
export function renderEmailHtml(options: EmailTemplateOptions): string {
  const {
    title,
    headline = title,
    body = '',
    cta,
    footer,
    timestamp,
  } = options;

  const date = timestamp
    ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
    : null;
  const footerText = footer ?? '邮件由 OtunLink 系统自动发送，本邮件为系统通知，请勿直接回复。';
  const brandLink = 'https://otun.musi.land';

  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="x-apple-disable-message-reformatting" />',
    '<meta name="color-scheme" content="light dark" />',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    '  body{margin:0;padding:0;background-color:#f3f4f6;}',
    '  .shell{background-color:#ffffff;border-radius:12px;overflow:hidden;}',
    '  .brand{background:linear-gradient(135deg,#2563eb,#4f46e5);color:#ffffff;}',
    '  @media (max-width:600px){',
    '    .container{width:100% !important;}',
    '    .body{padding:20px 16px !important;}',
    '    .brand{padding:20px 16px !important;}',
    '  }',
    '</style>',
    '</head>',
    '<body style="margin:0;padding:0;background-color:#f3f4f6;">',
    // preheader（部分客户端展开前展示）
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(title)}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">',
    '<tr><td class="shell">',
    // 品牌头部
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="brand">',
    '<tr><td class="brand" style="padding:24px 32px;">',
    `<a href="${brandLink}" style="color:#ffffff;text-decoration:none;font-size:20px;font-weight:700;letter-spacing:.5px;">OtunLink</a>`,
    '<div style="font-size:12px;color:#dbeafe;margin-top:4px;">供应链协同 · 多角色分账</div>',
    '</td></tr></table>',
    // 内容区
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">',
    '<tr><td class="body" style="padding:28px 32px;">',
    `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;line-height:1.4;">${escapeHtml(headline)}</h1>`,
    body,
    cta ? emailButton(cta.label, cta.url) : '',
    '</td></tr></table>',
    // 页脚
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">',
    '<tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.6;">',
    escapeHtml(footerText),
    date ? `<div style="margin-top:6px;">发送时间：${escapeHtml(date)}</div>` : '',
    '</td></tr></table>',
    '</td></tr></table>',
    '</td></tr></table>',
    '</body>',
    '</html>',
  ].join('\n');
}
