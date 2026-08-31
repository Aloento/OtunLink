# ck-00（P0）项目脚手架与 CI

## 目标
在 `C:\Codes\OtunLink` 建立可运行的 Monorepo 骨架：前端 SPA、API Worker、共享包，CI 通过，为后续 checkpoint 提供基础。

## 范围
- 🔨 pnpm workspaces Monorepo（design.md §6.3 目录结构）
- 🔨 apps/web：Vite + React + TypeScript（占位首页即可，依赖装好：@fluentui/react-components、tailwindcss、react-i18next、@azure/msal-react、@tanstack/react-query、zod）
- 🔨 apps/api：Hono Worker 占位（`GET /api/v1/health` 返回 ok），TS
- 🔨 packages/shared：类型/常量/错误码/zod 占位
- 🔨 packages/db：Drizzle 占位（空 schema，先不建表）
- 🔨 根 tsconfig 基础配置（paths 指向 packages）
- 🔨 wrangler.toml（api，占位 hyperdrive/kv 注释）+ wrangler.pages.toml 或 Pages 配置说明
- 🔨 `.env.example` / `.dev.vars.example`（占位变量名）
- 🔨 GitHub Actions：`.github/workflows/ci.yml`（install → typecheck → test → build）、`deploy.yml`（Pages/Workers 占位，先仅手动触发）
- 🔨 README 补充快速开始

## 不做
- 任何业务功能、数据库表、认证、页面设计（骨架仅占位）
- 真实 CF 部署与域名绑定（后续 checkpoint 或上线时做）

## 验收
1. `pnpm install` 成功
2. `pnpm -r typecheck` 通过
3. `pnpm -r test` 通过（可有 1 个占位测试）
4. `pnpm -r build` 通过（web 产出 dist、api 产出 worker 构建）
5. `wrangler dev` 能起 api（如环境允许），`GET /api/v1/health` 返回 `{"ok":true}`
6. CI workflow yaml 语法有效（可用 actionlint 或本地 dry-run 检查）

## 参考
design.md：§2.2 技术选型、§2.3 域名/仓库、§6.3 Monorepo 结构、§10 P0。
