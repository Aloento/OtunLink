# OtunLink 上线部署文档

> 目标形态：Cloudflare Pages（前端）+ Cloudflare Workers（API）+ Hyperdrive
>（私有 PostgreSQL 连接池）+ R2/S3 OBS（图片，见 `docs/cloud-config.md`）+ KV
>（JWKS 缓存）+ SMTP 直连邮件。

## 1. 组件与域名

| 组件 | 部署目标 | 域名（示例） |
| --- | --- | --- |
| 前端（`apps/web`） | Cloudflare Pages | `app.example.com` |
| API（`apps/api`） | Cloudflare Workers | `api.example.com` |
| 邮件（SMTP 直连） | Workers 出站连接外部 SMTP（465/587） | 无独立域名 |
| 图片存储 | R2（或 S3 兼容 OBS） | 走 Worker 内绑定 |

### 1.1 Pages

1. `pnpm -r build` 后，`apps/web/dist` 作为 Pages 构建输出目录（或 CI 中
   `pnpm --filter @otunlink/web build`）。
2. Pages 环境变量：`VITE_API_BASE`（如 `https://api.example.com`）、
   `VITE_AUTH_*`（见 `docs/auth-setup.md`）。
3. SPA fallback：Pages 设置 `_redirects` / 或使用 `SINGLE_PAGE_APPLICATION=true`。

### 1.2 Workers（API）

1. `apps/api/wrangler.toml` 配置 `name`、`compatibility_date`、`main`。
2. 绑定 Hyperdrive（见 §2）、R2 bucket、KV namespace。
3. 邮件 SMTP 直连：非敏感配置已在 `wrangler.toml [vars]`
   （`MAIL_PROVIDER`/`MAIL_FROM`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_STARTTLS`/`SMTP_AUTH`），
   凭据 `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` 需写入 secrets：
   `npx wrangler secret put SMTP_HOST`（以及 `SMTP_USER`/`SMTP_PASS`，见 §5）。
4. 部署：`cd apps/api && pnpm deploy`（或 `wrangler deploy`），
   `routes` 配置指向 `api.example.com/*`。
5. 迁移在 CI / 发布前执行（见 §4）。

### 1.3 邮件（SMTP 直连，可选）

API 通过 Cloudflare Workers 出站 TCP 直连外部 SMTP（仅 465 隐式 TLS / 587 STARTTLS，
25 端口被禁用），无需独立服务。配置（以飞书 Lark `otun@musi.land` 为例）：

- 非敏感项（`apps/api/wrangler.toml [vars]`）：`MAIL_PROVIDER=smtp`、`MAIL_FROM=otun@musi.land`、
  `SMTP_HOST=smtp.larksuite.com`、`SMTP_PORT`（默认 465）、`SMTP_SECURE`（`true`=465）/
  `SMTP_STARTTLS`（`true`=587）、`SMTP_AUTH`（`plain`/`login`/`cram-md5`）。
- secrets（生产 `wrangler secret put`，本地 `apps/api/.dev.vars`）：`SMTP_USER`、`SMTP_PASS`。

发信频率限制：200 封/100 秒；单发件人单日上限 450 封（`email_logs` 记录失败原因）。
未配置时 API 自动降级为仅站内通知（fail-safe），`POST /admin/test-email` 可测试连通性。

## 2. Hyperdrive

1. 在 Cloudflare 创建 Hyperdrive 实例，指向私有 PostgreSQL（连接串 / 隧道）。
2. API `wrangler.toml` 中把 `hyperdrive` binding 命名为 `DB`。
3. 生产建议：连接池 `maxConnections` ≤ 10、`minConnections` ≥ 1，
   `idleTimeout` 30s，开启 TLS。
4. 本地开发无 Hyperdrive 时用 `DATABASE_URL` 直连（`apps/api/.dev.vars`）。

## 3. 域名与 CNAME

| DNS 记录 | 类型 | 值 |
| --- | --- | --- |
| `app.example.com` | CNAME | `<pages-project>.pages.dev` |
| `api.example.com` | CNAME | `<worker>.workers.dev` |

若用自定义域直接托管 API，Workers 设置中绑定 `api.example.com` 即可，无需 CNAME。

## 4. 数据库迁移

> 迁移文件由 Drizzle Kit 生成（`packages/db/migrations/*.sql`），
> 运行时由 `scripts/embed-migrations.mjs` 内嵌到 API（See `apps/api`）。

```bash
# 本地生成（需要 .dev.vars 提供 DATABASE_URL）
pnpm --filter @otunlink/db exec drizzle-kit generate

# 本地 / 发布前执行迁移（幂等，按 journal 顺序）
pnpm --filter @otunlink/db exec drizzle-kit migrate
```

### 4.1 回滚

- **优先前滚**：只追加新迁移（`drizzle-kit generate`），不要改已发布迁移文件。
- 若必须回滚：手动执行对应 `down` SQL（或恢复数据库快照/时间点备份），
  并确认 `migrations.generated.ts` / `meta/_journal.json` 与线上一致。
- 破坏性变更（删列/改类型）先扩后缩：先加新列 + 双写，再迁移数据，最后删旧列。

## 5. 环境变量清单

### API（`apps/api/.dev.vars` / Workers 环境变量）

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `DATABASE_URL` | Hyperdrive 连接串或直连 PG | `postgres://...` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` | 使用 Hyperdrive binding 时可选 | — |
| `JWT_PUBLIC_KEY` (JWKS) / `AUTH_JWKS_URI` / `AUTH_ISSUER` / `AUTH_AUDIENCE` | 登录签名校验证 | 见 auth-setup.md |
| `KV_JWKS_CACHE` | KV binding 名称 | `JWKS_CACHE` |
| `R2_BUCKET` / `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | 图片存储 | 见 cloud-config.md |
| `MIGRATE_ON_START` | 启动时执行迁移 | `true`（生产关） |
| `SMTP_HOST` | SMTP 服务器地址（[vars]，不配 = 降级仅站内通知） | `smtp.larksuite.com` |
| `SMTP_USER` | SMTP 用户名（**secret**）；飞书 Lark 为发信账号 | `otun@musi.land` |
| `SMTP_PASS` | SMTP 密码/授权码（**secret**） | — |
| `MAIL_FROM` | 发件地址（[vars]） | `otun@musi.land` |
| `SMTP_PORT` | SMTP 端口（465=隐式 TLS / 587=STARTTLS，[vars]） | `465` |
| `SMTP_SECURE` | 465 隐式 TLS 时 `true`（[vars]） | `true` |
| `SMTP_STARTTLS` | 587 STARTTLS 时 `true`（[vars]） | `false` |
| `SMTP_AUTH` | 认证方式 `plain`/`login`/`cram-md5`（[vars]） | `plain` |
| `MAIL_PROVIDER` | `smtp`（默认）/ `api`（预留，[vars]） | `smtp` |

### 前端（Pages 环境变量）

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE` | API 基址 |
| `VITE_AUTH_CLIENT_ID` / `VITE_AUTH_TENANT` / `VITE_AUTH_REDIRECT_URI` | MSAL 配置 |

### Worker secrets（GitHub Actions Secrets / `wrangler secret put`）

CI（`.github/workflows/deploy.yml` 的 deploy-api job）会执行
`npx wrangler secret put SMTP_USER / SMTP_PASS / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY`，
读取 GitHub 仓库 Secrets（`SMTP_HOST`/`MAIL_FROM`/`SMTP_PORT`/S3 endpoint/region/bucket 等
非敏感项已在 `wrangler.toml [vars]`，无需作为 secret）。需在 GitHub 仓库
**Settings → Secrets and variables → Actions** 配置：

| Secret | 说明 | 示例 |
| --- | --- | --- |
| `SMTP_USER` | 邮件账号（必填才会发信） | `otun@musi.land` |
| `SMTP_PASS` | 邮箱授权码/密码 | — |
| `S3_ACCESS_KEY_ID` | 华为云 OBS AccessKey（图片上传） | `HPUA...` |
| `S3_SECRET_ACCESS_KEY` | 华为云 OBS SecretKey | — |
| `CLOUDFLARE_API_TOKEN` | CF API Token（部署） | — |
| `CLOUDFLARE_ACCOUNT_ID` | CF 账号 ID（`wrangler secret put` 需要） | `xxxxxxxx` |

未配置的项 CI 会跳过对应 secret 写入；SMTP 未配置时 API 降级为仅站内通知。

## 6. 上线前自检

详见 `docs/go-live-checklist.md`；最小可上线动作：
`pnpm -r typecheck && pnpm -r test && pnpm -r build` 全绿 → 执行迁移 →
`POST /admin/test-email` 验证邮件（未配置则确认返回降级原因）→
`GET /api/v1/health` 通过 → 放量。
