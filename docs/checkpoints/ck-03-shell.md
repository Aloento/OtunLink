# ck-03（P3）前端骨架（响应式+双语+守卫）

## 目标
搭建可用的前端应用外壳：Fluent UI + Tailwind 布局导航、移动优先响应式、中英双语、按岗位路由守卫、数据请求/缓存基础设施。业务页面本阶段仅占位。

## 范围
- 🔨 FluentProvider + 中文/英文 locale + Tailwind 混用规范（design.md §8.3：i18n 字典在 packages/shared，key 约定）
- 🔨 布局：侧边栏（桌面）/ 顶部导航（平板）/ **底部导航（手机 <768px）**；Fluent 组件库 + 触控适配
- 🔨 响应式：断点 <768 / 768–1024 / >1024；工具类（Table→Card 的列表组件）预留
- 🔨 路由表（design.md §6.1 全部路由，业务页先占位「开发中」）；路由守卫：按角色 + scope 显隐；PENDING 引导路由
- 🔨 请求层：API client（fetch 封装，带 token、统一 `{data}`/`{error:{code,message}}` 解析）、错误码→用户文案映射表（shared 错误码）
- 🔨 TanStack Query 配置 + persistQueryClient（IndexedDB）封装（缓存物品目录/字典/首页列表，TTL 策略见 §8.9）
- 🔨 登录态：MSAL 初始化、静默续签、登录后跳转；`/` 工作台占位（后续各 checkpoint 填待办聚合）
- 🔨 国际化：i18next 初始化、语言切换持久化、日期/数字/价格格式化（按业务单元时区，见 §4.4）
- 🔨 Playwright 冒烟（如已装）：登录→路由守卫→语言切换最简用例

## 不做
- 业务 CRUD 页面（仅占位）、扫码、图片、其它业务逻辑
- 邮件/通知

## 验收
1. 桌面/平板/手机三种宽度下布局可用（截图或冒烟说明）
2. 中英切换即时生效并持久化；所有页面文案走 i18n
3. 未授权路由跳转正确；PENDING 用户只能进引导页
4. dev server 冒烟通过：登录 → 工作台 → 路由切换正常
5. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§6.1 页面/路由、§8.3 i18n、§8.6 错误码、§8.9 前端缓存、§4.4 时区/货币。

## 完成情况

✅ 完成（commit e3dcd8f）。

- 响应式布局：桌面侧边栏 / 平板顶部导航 / 手机底部导航（断点 <768 / 768–1024 / >1024），ResponsiveTable 提供表格→卡片列表基础组件。
- i18n：i18next（initAsync:false，同步初始化）+ zh-CN/en 字典（locale 常量与 normalizeLocale 在 packages/shared，文案资源在 apps/web），语言切换 localStorage 持久化；Intl 日期/金额/数字格式化工具。
- 路由：design.md §6.1 全部路由 + 业务页占位「开发中」组件；RequireAuth / RequireActive / RequirePermission 守卫，按 shared `hasPermission` OR 语义判定。
- 请求层：fetch 封装（MSAL `acquireTokenSilent` 注入 Bearer、`{data}`/`{error:{code,message}}` 解析、错误码→i18n 文案映射、401 跳转 /login）。
- 缓存：QueryClient 配置 + `persistQueryClient`（IndexedDB，基于 idb-keyval 自建 Persister），白名单 items/units/dict/notifications/dashboard，maxAge 24h。
- 验证：`pnpm -r typecheck` ✅ / `pnpm -r test` ✅（web 33、shared 16、db 8、api 20）/ `pnpm -r build` ✅。

### 遗留问题 / 与任务差异

1. Fluent UI v9.74.7 的 `FluentProvider` 无 `locale` 属性（@fluentui/react-provider 类型中无 locale prop），Fluent 组件本地化无法通过 Provider 注入；改为 i18next + `document.documentElement.lang`，Fluent 自带日期/数字组件后续需单独适配。
2. 角色路由矩阵按 design.md §3.2 权限 OR 语义实现，与父任务简化清单略有出入：RETAILER 可读 /shipments（SHIPMENTS_READ），WAREHOUSE 可进 /sales（SALES_CREATE|SALES_REQUEST 之一）。 **⚠️ 2026-08-31 业务评审废弃**：RETAILER 为外部合作方（商铺买家），**不可见** /shipments——该描述与已确认业务语义不符（见 `docs/qa/rbac-matrix-vs-semantics.md`），实现修复时同步更新。 
3. 未引入 Playwright/jsdom：vitest 为 node 环境，测试仅覆盖纯函数（守卫 access、错误映射 http、格式化、i18n 资源一致性），未做 dev server 真实浏览器冒烟（MSAL 需真实 Entra 租户配置，验收 1/4 未截图验证）。
4. Vite 构建存在 765.19 kB chunk 体积告警（Fluent 全量 + MSAL），后续可按需分包。
5. 401 处理为骨架级：跳转 /login，未做 forceRefresh 重试与自动登出循环保护。
