# OtunLink 仓储库存 ERP

连接「中国集货 → 欧洲仓库 → 零售门店」的一体化仓储库存系统（私域 1688）。
覆盖集货发货单、收货点货与差异协商、入库建档、库存台账（手动出入库/报损/效期预警）、
零售价管理、销售单（请货/FEFO/折扣/支付/确认收货）、售后退货闭环、通知中心与审计日志。

## 技术栈

- **前端**：Vite + React + TypeScript + Fluent UI v9 + Tailwind + react-i18next + MSAL + TanStack Query
- **后端**：Hono（Cloudflare Workers）+ Drizzle ORM + Hyperdrive（私有 PostgreSQL）+ S3 兼容 OBS（图片）+ KV（JWKS 缓存）
- **部署**：Cloudflare Pages（前端）/ Workers（API）；CI：GitHub Actions（typecheck + test + build）

## 目录结构

```
apps/api          Hono API（Cloudflare Worker）
apps/web          前端 SPA（Vite + React）
packages/db       Drizzle schema、迁移、迁移 CLI（migrate/seed/ping）
packages/shared   API 与前端的共享类型、常量、校验 schema、RBAC 常量
```

## 快速开始

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

## 本地开发

```bash
# 前端（Vite dev server，默认 http://localhost:5173）
pnpm dev:web

# API（Wrangler dev，默认 http://localhost:8787；本地直连数据库用 dev:api:local）
pnpm dev:api
# 本地开发建议（绕过 Miniflare 的 Hyperdrive 模拟，直连 DATABASE_URL，见 docs/db-setup.md）：
pnpm dev:api:local
curl http://localhost:8787/api/v1/health   # => {"ok":true}
```

环境变量模板见 `.env.example`（前端）与 `.dev.vars.example`（复制为
`apps/api/.dev.vars`，wrangler dev 自动读取，已被 git 忽略）。

数据库需要私有 PostgreSQL：本地直连见 `docs/db-setup.md`（migrate/seed/ping）；
生产经 Cloudflare Hyperdrive，连接配置见 `docs/deploy.md`。

## 功能说明

- **站内通知**：关键业务动作（待点货、差异 review、发货/售后退货、销售发送/支付/确认、
  入库/出库过账、效期预警等）写入 `notifications`，登录后在导航铃铛与
  `/notifications` 页查看；工作台 `/` 按角色聚合待办（`GET /api/v1/dashboard/todos`）。
- **邮件（可选）**：`SMTP_HOST`/`MAIL_FROM` 等非敏感配置已在 `wrangler.toml [vars]`
  （飞书 Lark：`smtp.larksuite.com`、发信人 `otun@musi.land`）；再配置
  `SMTP_USER` / `SMTP_PASS`（生产经 GitHub secret + `wrangler secret put`，
  本地写 `apps/api/.dev.vars`）后，API 通过 Cloudflare Workers 直连外部 SMTP
  （端口 465 隐式 TLS 或 587 STARTTLS）发送邮件；**未配置时自动降级为仅站内通知**，
  `POST /api/v1/admin/test-email` 可测试连通性。
- **审计日志**：`audit_logs` 记录关键写操作的 actor/entity/before/after，
  管理员经 `GET /api/v1/admin/audit-logs` 分页筛选查询。

## 部署与上线

- 部署（Pages / Workers / Hyperdrive / 域名 CNAME / 迁移与回滚）：[docs/deploy.md](docs/deploy.md)
- 上线前分阶段检查：[docs/go-live-checklist.md](docs/go-live-checklist.md)
- 云资源配置（OBS、KV、Hyperdrive）：[docs/cloud-config.md](docs/cloud-config.md)
- Entra ID 应用注册：[docs/auth-setup.md](docs/auth-setup.md)