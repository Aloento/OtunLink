# ck-01（P1）数据库与基础设施

## 目标
打通「私有 PostgreSQL ← Hyperdrive ← Worker」，建立 Drizzle 全量表与迁移机制，为后续业务提供数据层。

## 顺序要求（重要）
**先验证私有 PG 可达性，再建表。** 若不可达，立即停下记录阻塞，不要继续写无法验证的代码。

## 范围
- 🔨 私有 PG 可达性验证：在 `docs/db-setup.md` 记录步骤与结论——PG 对外白名单/防火墙放行 CF 出口、SSL（require/verify-full）、连接串；用 wrangler 绑定 hyperdrive 并在 Worker 中 `SELECT 1` 验证
- 🔨 本地开发：`wrangler dev` 支持读取 `.dev.vars` 的 DATABASE_URL 直连（无 Hyperdrive 时的降级），文档说明
- 🔨 Drizzle：按 design.md §7 定义**全部表**（business_units/users/items/item_images/shipments/shipment_items/shipment_trackings/batches/inbound_orders/inbound_order_items/outbound_orders/outbound_order_items/return_orders/return_order_items/discrepancy_reviews/sales_orders/sales_order_items/sales_batch_allocations/payments/stock/stock_movements/retail_prices/notifications/email_logs/audit_logs 等），含枚举、索引、唯一约束（如 carrier+tracking_no、items 条码部分唯一、stock 主键 unit×item×batch）
- 🔨 drizzle-kit：生成迁移 SQL 并 apply
- 🔨 迁移执行器：`POST /api/v1/admin/migrate`（ADMIN + header secret，design.md §8.6），记录执行历史
- 🔨 种子：预置示例业务单元（上海集货/广州集货/匈牙利仓/奥地利仓/XX超市/YY超市）可开关
- 🔨 packages/db 导出 schema 类型供 shared 使用

## 不做
- 认证、业务 API、前端业务页（仅可能提供最简管理入口/脚本跑迁移）

## 验收
1. 迁移可在本地/测试库执行且无错；迁移后可看到全部表
2. `POST /admin/migrate` 可执行幂等迁移（记录已执行版本）
3. Worker 内经 Hyperdrive（或本地直连）`SELECT 1` 通过（记录结论）
4. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过
5. docs/db-setup.md 包含 PG 白名单/SSL 配置步骤

## 参考
design.md：§7 数据库、§8.2 并发、§8.6 错误约定、§10 P1、§11 风险 1。
