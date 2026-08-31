# OtunLink Mail Bridge（邮件桥，§8.8）

OtunLink 的轻量 HTTP → SMTP 邮件桥（**可部署样例**）。API Worker 通过
`POST {BRIDGE_URL}/send`（`X-API-KEY` 鉴权）投递邮件，本服务转交给 SMTP 服务器。

- 仅使用 Node.js 内置模块（`node:http` / `node:net` / `node:tls`），**零 npm 依赖**。
- 不属于 pnpm workspace（`pnpm-workspace.yaml` 只含 `apps/*` 与 `packages/*`），
  自带 `package.json`，不会影响仓库的 `pnpm -r typecheck / test / build`。
- 生产环境建议用真实 SMTP 服务（465 隐式 TLS 或内网 25 中继）；如用云厂商
  Worker，可直接用 `nodemailer` 等替代本实现。

## 运行

```bash
cd infra/mail-bridge
BRIDGE_API_KEY=change-me \
SMTP_HOST=smtp.example.com SMTP_PORT=465 SMTP_SECURE=true \
SMTP_USER=robot@example.com SMTP_PASS=***** \
MAIL_FROM=noreply@example.com MAIL_FROM_NAME=OtunLink \
node index.js
```

默认端口 `8787`（`PORT` 可覆盖）。启动日志会打印 `smtp=...` 或 `smtp=未配置`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 探活；`{"ok":true,"smtp":"configured"\|"not-configured"}` |
| `POST` | `/send` | `X-API-KEY` 必填；body `{ to, subject, text }` |

成功：`{"ok":true,"id":"bridge-..."}`；
SMTP 未配置：`503 {"ok":false,"reason":"...未配置（降级为仅站内通知）"}`；
发送失败：`502 {"ok":false,"reason":"SMTP 发送失败：..."}`。

curl 测试：

```bash
curl -X POST http://localhost:8787/send \
  -H 'X-API-KEY: change-me' -H 'Content-Type: application/json' \
  -d '{"to":"a@example.com","subject":"test","text":"hello"}'
```

## SMTP 能力（smtp-client.js）

- 支持 `AUTH LOGIN` / `AUTH PLAIN`；CRAM-MD5 不支持。
- 支持 25 端口明文 / 465 隐式 TLS；**不支持显式 STARTTLS**——
  如 SMTP 服务只开 587（STARTTLS），请改用 465 或内网中继。
- `Subject` 会做换行清洗，正文按 `text/plain; charset=utf-8` 发送。

## 与 API 侧的联动

API 侧环境变量（见 `docs/deploy.md`）：

- `BRIDGE_URL`（如 `https://mail-bridge.example.com`）
- `BRIDGE_API_KEY`（与本服务 `BRIDGE_API_KEY` 一致）
- `MAIL_FROM`

未配置时 API 自动降级为「仅站内通知」，`POST /admin/test-email` 会返回降级原因。
