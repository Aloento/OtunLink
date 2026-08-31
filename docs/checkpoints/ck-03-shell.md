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
