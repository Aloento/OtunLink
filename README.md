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
- 后端：Hono（Cloudflare Workers）+ Drizzle ORM + Hyperdrive（私有 PostgreSQL）+ R2（图片）+ KV（JWKS 缓存）
- 部署：Cloudflare Pages（前端）/ Workers（API）；CI：GitHub Actions

## 快速开始

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm -r build
```
