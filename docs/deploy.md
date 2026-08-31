# OtunLink 上线部署文档

> 目标形态：Cloudflare Pages（前端）+ Cloudflare Workers（API）+ Hyperdrive
>（私有 PostgreSQL 连接池）+ R2/S3 OBS（图片，见 `docs/cloud-config.md`）+ KV
>（JWKS 缓存）+ 可选 `infra/mail-bridge`（邮件桥，§8.8）。

## 1. 组件与域名

| 组件 | 部署目标 | 域名（示例） |
| --- | --- | --- |
| 前端（`apps/web`） | Cloudflare Pages | `app.example.com` |
| API（`apps/api`） | Cloudflare Workers | `api.example.com` |
| 邮件桥（`infra/mail-bridge`，可选） | 任意可跑 Node 18+ 的容器 / VPS / 内网中继 | `bridge.example.com` |
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
3. 部署：`cd apps/api && pnpm deploy`（或 `wrangler deploy`），
   `routes` 配置指向 `api.example.com/*`。
4. 迁移在 CI / 发布前执行（见 §4）。

### 1.3 邮件桥（可选）

```bash
cd infra/mail-bridge
BRIDGE_API_KEY=<与 API 一致> SMTP_HOST=... SMTP_PORT=465 SMTP_SECURE=true \
SMTP_USER=... SMTP_PASS=... MAIL_FROM=noreply@example.com MAIL_FROM_NAME=OtunLink \
node index.js
```

用 Nginx / Cloudflare Tunnel / 防火墙把 `bridge.example.com` 指向该进程；
务必限制只允许 API Worker 出口 IP 访问（或依赖 `BRIDGE_API_KEY` 鉴权）。
见 `infra/mail-bridge/README.md`。

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
| `bridge.example.com`（可选） | CNAME / A | 邮件桥 IP 或隧道 |

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
| `BRIDGE_URL` | 邮件桥地址（不配 = 降级仅站内通知） | `https://bridge.example.com` |
| `BRIDGE_API_KEY` | 邮件桥 API 密钥（与桥一致） | `change-me` |
| `MAIL_FROM` | 发件地址（必填才启用邮件） | `noreply@example.com` |
| `MAIL_FROM_NAME` | 发件人显示名（可选） | `OtunLink` |
| `MAIL_PROVIDER` | `bridge`（默认）/ `api`（预留，未实现时置 bridge） | `bridge` |

### 前端（Pages 环境变量）

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE` | API 基址 |
| `VITE_AUTH_CLIENT_ID` / `VITE_AUTH_TENANT` / `VITE_AUTH_REDIRECT_URI` | MSAL 配置 |

### 邮件桥

`PORT`、`BRIDGE_API_KEY`、`SMTP_HOST`、`SMTP_PORT`（默认 465）、
`SMTP_SECURE`（默认 true）、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM`、`MAIL_FROM_NAME`。

## 6. 上线前自检

详见 `docs/go-live-checklist.md`；最小可上线动作：
`pnpm -r typecheck && pnpm -r test && pnpm -r build` 全绿 → 执行迁移 →
`POST /admin/test-email` 验证邮件（未配置则确认返回降级原因）→
`GET /api/v1/health` 通过 → 放量。
