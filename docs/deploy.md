# OtunLink 上线部署文档

> 目标形态：Cloudflare Pages（前端）+ Cloudflare Workers（API）+ Hyperdrive
> （私有 PostgreSQL 连接池）+ S3 兼容 OBS（图片，见 `docs/cloud-config.md`；不使用 R2）
> + KV（JWKS 缓存）+ SMTP 直连邮件。

## 1. 组件与域名

| 组件               | 部署目标                             | 域名（实际）        |
| ------------------ | ------------------------------------ | ------------------- |
| 前端（`apps/web`） | Cloudflare Pages                     | `otun.musi.land`    |
| API（`apps/api`）  | Cloudflare Workers                   | `api.otun.musi.land` |
| 邮件（SMTP 直连）  | Workers 出站连接外部 SMTP（465/587） | 无独立域名          |
| 图片存储           | S3 兼容 OBS（无绑定，环境变量）      | 走 Worker 环境变量  |

### 1.1 Pages

1. `pnpm -r build` 后，`apps/web/dist` 作为 Pages 构建输出目录（或 CI 中
   `pnpm --filter @otunlink/web build`）。
2. Pages 环境变量（构建时内联，见 §5）：`VITE_API_BASE_URL`（如 `https://api.otun.musi.land`）、
   `VITE_ENTRA_TENANT_ID`/`VITE_ENTRA_CLIENT_ID`/`VITE_REDIRECT_URI`/`VITE_API_SCOPE`。
3. SPA fallback：Pages 设置 `SINGLE_PAGE_APPLICATION=true`（或 `_redirects`）。

### 1.2 Workers（API）

1. `apps/api/wrangler.toml` 配置 `name`、`compatibility_date`、`main`。
2. 绑定 Hyperdrive（见 §2）、KV namespace（`JWKS_CACHE`）。图片存储为 S3 兼容 OBS，
   无 Worker 绑定，经环境变量访问（见 §5）。
3. 邮件 SMTP 直连：非敏感配置已在 `wrangler.toml [vars]`
   （`MAIL_PROVIDER`/`MAIL_FROM`/`SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_STARTTLS`/`SMTP_AUTH`），
   凭据 `SMTP_USER`/`SMTP_PASS` 需写入 secrets（`npx wrangler secret put …`，见 §5）。
4. 部署：`cd apps/api && pnpm deploy`（或 `wrangler deploy`），
   `routes` 配置指向 `api.otun.musi.land`（`wrangler.toml` 已配置自定义域）。
5. 迁移在 CI / 发布前执行（见 §4）。

### 1.3 邮件（SMTP 直连，可选）

API 通过 Cloudflare Workers 出站 TCP 直连外部 SMTP（仅 465 隐式 TLS / 587 STARTTLS，
25 端口被禁用），无需独立服务。配置（以飞书 Lark 邮箱为例）：

- 非敏感项（`apps/api/wrangler.toml [vars]`）：`MAIL_PROVIDER=smtp`、`MAIL_FROM=<MAIL_FROM>`、
  `SMTP_HOST=<SMTP_HOST>`、`SMTP_PORT`（默认 465）、`SMTP_SECURE`（`true`=465）/
  `SMTP_STARTTLS`（`true`=587）、`SMTP_AUTH`（`plain`/`login`/`cram-md5`）。
- secrets（生产 `wrangler secret put`，本地 `apps/api/.dev.vars`）：`SMTP_USER`、`SMTP_PASS`。

发信频率限制：200 封/100 秒；单发件人单日上限 450 封（`email_logs` 记录失败原因）。
未配置时 API 自动降级为仅站内通知（fail-safe），`POST /api/v1/admin/test-email` 可测试连通性。

## 2. Hyperdrive

1. 在 Cloudflare 创建 Hyperdrive 实例，指向私有 PostgreSQL（连接串 / 隧道）。
2. API `wrangler.toml` 中把 hyperdrive binding 命名为 `HYPERDRIVE`（已配置，见 `docs/cloud-config.md`）。
3. 生产建议：连接池 `maxConnections` ≤ 10、`minConnections` ≥ 1，
   `idleTimeout` 30s，开启 TLS。
4. 本地开发无 Hyperdrive 时用 `DATABASE_URL` 直连（`apps/api/.dev.vars`）。

## 3. 域名与 CNAME

| DNS 记录                  | 类型  | 值                          |
| ------------------------- | ----- | --------------------------- |
| `otun.musi.land`          | CNAME | `<pages-project>.pages.dev` |
| `api.otun.musi.land`      | CNAME | `<worker>.workers.dev`      |

若用自定义域直接托管 API，Workers 设置中绑定 `api.otun.musi.land` 即可，无需 CNAME。

## 4. 数据库迁移

> 迁移文件由 Drizzle Kit 生成（`packages/db/migrations/*.sql`），
> 运行时由 `packages/db/scripts/embed-migrations.mjs` 内嵌到 API（`migrations.generated.ts`）。

```bash
# 生成迁移并内嵌（依据 schema，离线，无需数据库）
pnpm --filter @otunlink/db db:generate

# 本地 / 发布前执行迁移（幂等，按 schema_migrations 顺序，需要 DATABASE_URL）
pnpm --filter @otunlink/db db:migrate

# 或经 API 执行（部署后用 X-Admin-Secret 调用）
curl -X POST https://api.otun.musi.land/api/v1/admin/migrate -H "X-Admin-Secret: $ADMIN_SECRET"
```

### 4.1 回滚

- **优先前滚**：只追加新迁移（`db:generate`），不要改已发布迁移文件。
- 若必须回滚：手动执行对应 `down` SQL（或恢复数据库快照/时间点备份），
  并确认 `migrations.generated.ts` / `meta/_journal.json` 与线上一致。
- 破坏性变更（删列/改类型）先扩后缩：先加新列 + 双写，再迁移数据，最后删旧列。

## 5. 环境变量清单

### API（`apps/api/.dev.vars` / Workers 环境变量）

| 变量 | 说明 | 示例 |
| ---- | ---- | ---- |
| `DATABASE_URL` | 本地直连 PG（生产走 Hyperdrive binding，无需此项） | `postgres://...` |
| `ADMIN_SECRET` | `/api/v1/admin/migrate` 的 bootstrap 密钥（X-Admin-Secret） | — |
| `ENTRA_TENANT_ID` | Entra 租户（目录）ID | `<TENANT_ID>` |
| `ENTRA_CLIENT_ID` | Entra 应用（客户端）ID | `<CLIENT_ID>` |
| `ENTRA_AUDIENCE` | 可选：token `aud` 校验值（默认接受 client id / `api://<client-id>` 及 MSAL 默认 scope） | `https://<TENANT_DOMAIN>.onmicrosoft.com/OtunLink/API` |
| `ENTRA_ISSUER` | 可选：JWT issuer 覆盖（默认 `https://login.microsoftonline.com/<TENANT_ID>/v2.0`） | — |
| `JWKS_CACHE` | KV binding（wrangler.toml `[[kv_namespaces]]` 声明，非环境变量） | `JWKS_CACHE` |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | 华为云 OBS 非敏感配置（[vars]） | `<OBS_ENDPOINT>` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | OBS 凭据（**secret**，`wrangler secret put`） | — |
| `MAIL_PROVIDER` | `smtp`（默认）/ `api`（预留，[vars]） | `smtp` |
| `MAIL_FROM` | 发件地址（[vars]） | `<MAIL_FROM>` |
| `SMTP_HOST` | SMTP 服务器地址（[vars]；不配 = 降级仅站内通知） | `<SMTP_HOST>` |
| `SMTP_PORT` | SMTP 端口（465=隐式 TLS / 587=STARTTLS，[vars]） | `465` |
| `SMTP_SECURE` | 465 隐式 TLS 时 `true`（[vars]） | `true` |
| `SMTP_STARTTLS` | 587 STARTTLS 时 `true`（[vars]） | `false` |
| `SMTP_AUTH` | 认证方式 `plain`/`login`/`cram-md5`（[vars]） | `plain` |
| `SMTP_USER` | SMTP 用户名（**secret**）；发信账号由 SMTP 服务商提供 | `<SMTP_USER>` |
| `SMTP_PASS` | SMTP 密码/授权码（**secret**） | — |

### 前端（Pages 环境变量 / `apps/web/.env.production`）

| 变量 | 说明 |
| ---- | ---- |
| `VITE_API_BASE_URL` | API 基址（默认回退 `http://localhost:8787`，生产必须设置，如 `https://api.otun.musi.land`） |
| `VITE_ENTRA_TENANT_ID` | Entra 租户 ID |
| `VITE_ENTRA_CLIENT_ID` | Entra 客户端 ID |
| `VITE_REDIRECT_URI` | 可选：重定向地址（默认生产 `https://otun.musi.land/auth/callback`） |
| `VITE_API_SCOPE` | 可选：API scope（默认 `api://<client-id>/OtunLink.API`） |

### Worker secrets（GitHub Actions Secrets / `wrangler secret put`）

CI（`.github/workflows/deploy.yml` 的 deploy-api job）会执行
`npx wrangler secret put SMTP_USER / SMTP_PASS / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY`，
读取 GitHub 仓库 Secrets（`SMTP_HOST`/`MAIL_FROM`/`SMTP_PORT`/S3 endpoint/region/bucket 等
非敏感项已在 `wrangler.toml [vars]`，无需作为 secret）。

`wrangler.toml` 中 `HYPERDRIVE`/`JWKS_CACHE` 绑定的 id 以 `<your-hyperdrive-id>`/`<your-kv-id>`
占位符提交，CI 的 Deploy step 先执行 `sed` 将占位符替换为下面的 Secrets 值再 `wrangler deploy`
（本地开发 `wrangler dev` 需手动回填）。需在 GitHub 仓库 **Settings → Secrets and variables → Actions** 配置：

| Secret                  | 说明                                     | 示例             |
| ----------------------- | ---------------------------------------- | ---------------- |
| `HYPERDRIVE_ID`         | Hyperdrive 实例 id（**必填**，CF 控制台 Hyperdrive 页面） | `<HYPERDRIVE_ID>` |
| `KV_NAMESPACE_ID`       | KV 命名空间 id（**必填**，CF 控制台 KV 页面，`JWKS_CACHE` 绑定） | `<KV_NAMESPACE_ID>` |
| `SMTP_USER`             | 邮件账号（必填才会发信）                 | `<SMTP_USER>` |
| `SMTP_PASS`             | 邮箱授权码/密码                          | —                |
| `S3_ACCESS_KEY_ID`      | 华为云 OBS AccessKey（图片上传）         | `xxxxxxxx...`        |
| `S3_SECRET_ACCESS_KEY`  | 华为云 OBS SecretKey                     | —                |
| `CLOUDFLARE_API_TOKEN`  | CF API Token（部署）                     | —                |
| `CLOUDFLARE_ACCOUNT_ID` | CF 账号 ID（`wrangler secret put` 需要） | `xxxxxxxx`       |

`HYPERDRIVE_ID`/`KV_NAMESPACE_ID` 未配置时 deploy-api 会直接失败（Check 步骤给出明确错误）；
其余未配置的项 CI 会跳过对应 secret 写入；SMTP 未配置时 API 降级为仅站内通知。

## 6. 上线前自检

详见 `docs/go-live-checklist.md`；最小可上线动作：
`pnpm -r typecheck && pnpm -r test && pnpm -r build` 全绿 → 执行迁移 →
`POST /api/v1/admin/test-email` 验证邮件（未配置则确认返回降级原因）→
`GET /api/v1/health` 通过 → 放量。
