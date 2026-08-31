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

---

## 完成情况

- ✅ **完成**：pnpm workspaces Monorepo（`apps/web`、`apps/api`、`packages/shared`、`packages/db`）+ 根 `package.json`/`pnpm-workspace.yaml`/`tsconfig.base.json`（paths 指向 packages）。
- ✅ **完成**：`apps/web` Vite+React+TS 占位首页，依赖齐备（Fluent UI v9、Tailwind v4、react-i18next、MSAL、TanStack Query、zod）；`vite.config.ts`、`tsconfig.json`、`src/`（App/入口/测试）。
- ✅ **完成**：`apps/api` Hono Worker，`GET /api/v1/health` 返回 `{"ok":true}`；`wrangler.toml` 含 hyperdrive/kv/r2 占位注释；`src/index.ts` + 测试。
- ✅ **完成**：`packages/shared`（常量/错误码占位）、`packages/db`（Drizzle 空 schema + `drizzle.config.ts`）。
- ✅ **完成**：`.github/workflows/ci.yml`（install→typecheck→test→build）+ `deploy.yml`（workflow_dispatch 占位）。
- ✅ **完成**：`.env.example`、`.dev.vars.example`、`.gitignore` 已覆盖构建产物/`.dev.vars`/`.wrangler` 等。
- ✅ **验证**：`pnpm install` ✅；`pnpm -r typecheck` ✅；`pnpm -r test` ✅（4 包 6 用例全通过）；`pnpm -r build` ✅（web 产出 dist，api 经 `wrangler deploy --dry-run` 产出 worker 构建）；`wrangler dev` 起 api 后 `curl http://127.0.0.1:8787/api/v1/health` 返回 `{"ok":true}`（HTTP 200）。
- ⚠️ **说明**：pnpm 11 需在 `pnpm-workspace.yaml` 中通过 `onlyBuiltDependencies` 显式放行 `esbuild`/`sharp`/`workerd` 的安装脚本（首次 install 会因 ignored builds 退出，已配置并 `pnpm rebuild` 解决）。`deploy.yml` 为占位，真实 Pages/Workers 部署待后续 checkpoint 接入。
