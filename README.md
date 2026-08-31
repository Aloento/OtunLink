# OtunLink 仓储库存 ERP

连接「中国集货 → 欧洲仓库 → 零售门店」的一体化仓储库存系统（私域 1688）。

- **设计文档**：[docs/design.md](docs/design.md)（v1.1，含架构/领域模型/状态机/API/数据库/关键技术/阶段计划）
- **实施计划**：[docs/checkpoints/README.md](docs/checkpoints/README.md)（13 个串行 checkpoint）

## 开发方式：每轮一个 checkpoint，串行实现

为避免一次性实现大计划导致上下文丢失，本仓库按如下方式推进：

1. 计划与设计固化在 `docs/design.md`。
2. 实施拆分为 `docs/checkpoints/ck-*.md`，**每个 checkpoint 由一个独立 agent（全新上下文）负责一轮**，一次只实现一个。
3. 每轮开始前读取对应 checkpoint 文档与 design.md 相关章节；结束后必跑验证（typecheck / test / build，涉及 UI 补冒烟）。
4. 每轮完成即提交（conventional commit，附 Co-authored-by trailer），由主对话验收通过后再启动下一轮，**严格串行**。
5. 模块与目录结构见 design.md §6.3；API 与页面见 §6；阶段清单见 §10。

## 技术栈（详见 design.md §2）

- 前端：Vite + React + TypeScript + Fluent UI v9 + Tailwind + react-i18next + MSAL + TanStack Query
- 后端：Hono（Cloudflare Workers）+ Drizzle ORM + Hyperdrive（私有 PostgreSQL）+ S3 兼容 OBS（图片）+ KV（JWKS 缓存）
- 部署：Cloudflare Pages（前端）/ Workers（API）；CI：GitHub Actions

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

# API（Wrangler dev，默认 http://localhost:8787）
pnpm dev:api
# 健康检查
curl http://localhost:8787/api/v1/health   # => {"ok":true}
```

环境变量模板见 `.env.example`（根级）与 `.dev.vars.example`（复制为
`apps/api/.dev.vars`，wrangler dev 自动读取，已被 git 忽略）。

## 站内通知与邮件（ck-10 / design.md §8.5、§8.8）

- **站内通知**：无需配置。关键业务动作（待点货、差异 review、发货/售后退货、
  销售发送/支付/确认、入库/出库过账、效期预警等）会写入 `notifications`，
  登录后在导航铃铛（未读徽标）与 `/notifications` 页查看；工作台 `/` 按角色
  聚合待办（`GET /dashboard/todos`）。
- **邮件（可选）**：配置 `BRIDGE_URL` / `BRIDGE_API_KEY` / `MAIL_FROM` 后，
  API 通过 `infra/mail-bridge`（零依赖 Node 服务，见其 README）发送邮件；
  **未配置时自动降级为仅站内通知**，`POST /admin/test-email` 可测试连通性。
- **审计日志**：`audit_logs` 记录关键写操作的 actor/entity/before/after，
  管理员经 `GET /admin/audit-logs` 分页筛选查询。

## 上线

部署（Pages / Workers / Hyperdrive / 域名 CNAME / 迁移与回滚）见
`docs/deploy.md`；上线前分阶段检查见 `docs/go-live-checklist.md`。
