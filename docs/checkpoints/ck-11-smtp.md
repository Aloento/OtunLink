# ck-11（P10+）SMTP 直连并移除邮件桥

## 背景

`ck-10` 实现了 `EmailProvider` + 邮件桥（`infra/mail-bridge`，HTTP→SMTP）。本轮改为
**SMTP 直连**：经 Cloudflare Workers 出站 TCP（`cloudflare:sockets`，`compatibility_date >= 2024-11-01`）
直连外部 SMTP，并删除邮件桥。

## 目标

1. `MAIL_PROVIDER` 默认值由 `bridge` 改为 `smtp`（`lib/email.ts`）。
2. 移除 `createBridgeProvider` / `BRIDGE_URL` / `BRIDGE_API_KEY` 分支。
3. 删除 `infra/mail-bridge/`。
4. 环境变量 / wrangler 配置同步（`[vars]` + secrets）。
5. 部署 workflow 写入 SMTP secrets（`wrangler secret put SMTP_*`）。
6. 设计 / 部署 / 上线清单 / README / checkpoint 总览同步。

## 实现

- `apps/api/src/lib/email.ts`：默认 `smtp`；移除 `createBridgeProvider`；`createMailer` /
  `mailerStatus` 仅保留 `smtp` / `api`；保留 `worker-mailer` 动态 import。
- `apps/api/src/types.ts`：移除 `BRIDGE_URL` / `BRIDGE_API_KEY`，邮件注释改为 SMTP 默认。
- `apps/api/src/smoke.test.ts`：`/admin/test-email` 期望改 `provider:'smtp'` + `未配置 SMTP_HOST`。
- `apps/api/src/routes/test-email.ts`、`apps/api/src/index.ts`、`apps/api/src/lib/expiry-scan.ts`：
  注释/文案由「邮件桥」改为「SMTP」。
- `apps/web/src/i18n/resources/{zh-CN,en}.ts`：邮件文案由「邮件桥」改为「SMTP / 邮件提供方」。
- `.env.example` / `.dev.vars.example`：邮件段改为 SMTP 变量（`SMTP_HOST/PORT/USER/PASS/SECURE/STARTTLS/AUTH` + `MAIL_FROM`）。
- `apps/api/wrangler.toml` / `wrangler.local.toml`：`[vars]` 加非敏感 SMTP 配置
  （`MAIL_PROVIDER`/`MAIL_FROM`/`SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_STARTTLS`/`SMTP_AUTH`）；
  `SMTP_USER/SMTP_PASS` 走 secrets。
- `.github/workflows/deploy.yml`：deploy-api job 增加 `wrangler secret put SMTP_USER/SMTP_PASS`
  （读取 GitHub secrets，未配置则跳过）。
- 删除 `infra/mail-bridge/`（index.js、smtp-client.js、package.json、README.md）。
- 文档：`README.md`、`plan.md`、`docs/design.md` §8.8、`docs/deploy.md`、
  `docs/go-live-checklist.md`、`docs/checkpoints/README.md`（新增本行）。

## 环境变量

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `MAIL_PROVIDER` | vars | `smtp`（默认）/ `api`（预留） |
| `MAIL_FROM` | vars | 发件地址，如 `otun@musi.land` |
| `SMTP_HOST` | vars | SMTP 服务器地址，如 `smtp.larksuite.com` |
| `SMTP_PORT` | vars | 465（隐式 TLS）/ 587（STARTTLS） |
| `SMTP_SECURE` | vars | 465 时 `true` |
| `SMTP_STARTTLS` | vars | 587 时 `true` |
| `SMTP_AUTH` | vars | `plain` / `login` / `cram-md5` |
| `SMTP_USER` | secret | SMTP 用户名（账号，如 `otun@musi.land`） |
| `SMTP_PASS` | secret | SMTP 密码 / 授权码 |

## 验证

- `pnpm -r typecheck` / `pnpm -r test` / `pnpm -r build` 全绿。
- `infra/mail-bridge` 已删除，全仓库无 `BRIDGE_URL` / `BRIDGE_API_KEY` 引用。

## 待用户配置（GitHub Actions Secrets）

CI 自动 `wrangler secret put` 的 secrets（`SMTP_HOST`/`MAIL_FROM` 等非敏感项已在 `wrangler.toml [vars]`）：

- `SMTP_USER` / `SMTP_PASS`（邮件）。
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`（华为云 OBS 图片存储）。
- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`（部署 / secret 写入）。
