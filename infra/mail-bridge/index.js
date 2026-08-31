import http from 'node:http';

import { sendMailViaSmtp } from './smtp-client.js';

// OtunLink mail bridge (design.md §8.8)：
// 接收 API 侧 POST /send（X-API-KEY 鉴权），转交给 SMTP。
// 仅使用 Node 内置模块；无 SMTP 配置时返回 503 降级原因。

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.BRIDGE_API_KEY ?? '';
const SMTP = {
  host: process.env.SMTP_HOST ?? '',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
  user: process.env.SMTP_USER ?? '',
  pass: process.env.SMTP_PASS ?? '',
  from: process.env.MAIL_FROM ?? '',
  fromName: process.env.MAIL_FROM_NAME ?? '',
};

console.log(`[mail-bridge] listening on :${PORT} (smtp=${SMTP.host ? SMTP.host + ':' + SMTP.port : '未配置'})`);

export function mailerConfig() {
  if (!SMTP.host || !SMTP.from) return { ok: false, reason: 'SMTP_HOST/SMTP_PORT/MAIL_FROM 未配置（降级为仅站内通知）' };
  return { ok: true };
}

async function handleSend(req, res) {
  const auth = req.headers['x-api-key'] ?? '';
  if (!API_KEY || auth !== API_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, reason: 'x-api-key 缺失或不匹配' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, reason: '请求体必须是 JSON' }));
    return;
  }

  const { to, subject, text } = payload ?? {};
  if (!to || !subject) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, reason: 'to / subject 为必填' }));
    return;
  }

  if (!SMTP.host || !SMTP.from) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, reason: 'SMTP_HOST/SMTP_PORT/MAIL_FROM 未配置（降级为仅站内通知）' }));
    return;
  }

  try {
    await sendMailViaSmtp(SMTP, { to, subject, text });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id: `bridge-${Date.now()}` }));
  } catch (err) {
    console.error('[mail-bridge] send failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, reason: `SMTP 发送失败：${err.message}` }));
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, smtp: SMTP.host ? 'configured' : 'not-configured' }));
    return;
  }
  if (req.method === 'POST' && req.url === '/send') {
    handleSend(req, res).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: String(err?.message ?? err) }));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, reason: 'not found' }));
});

server.listen(PORT);

export { server };
