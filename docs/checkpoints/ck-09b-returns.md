# ck-09b（P9b）零售售后退货闭环

## 目标
零售方发起售后（对已发送销售单）→ 仓库审核（同意/拒绝）→ 退回收货 → 按原批次回补库存（未知批次标记「待检」）；含部分退货。

## 范围
- 🔨 发起：`POST /sales-orders/:id/returns`（source_type=SALES）——行级退货数量（≤实收/未退）、原因+照片；状态 REQUESTED
- 🔨 审核：`POST /return-orders/:id/approve|reject`（仓库）——同意则待收货（RETURN_PENDING?），拒绝附理由（终态 CANCELLED）
- 🔨 退回收货：`POST /return-orders/:id/receive` —— 录入实收退货数量 → 经 StockService 回补：
  - **优先原批次**（按 sales_batch_allocations 对应批次）
  - 无原批次信息/效期不可考 → 回补到「退货待检批次」（同物品，无生产/到期或标记 RETURNS_PENDING），提示仓库质检（页面标记）
  - movements=RETURN_IN；状态 → RETURNED（闭环）
- 🔨 UI：`/returns`（售后 Tab，零售/仓库各自视角）、销售单详情「发起售后/售后状态」
- 🔨 测试：部分退货、全量退货、原批次回补、未知批次待检、审核拒绝分支、金额/数量校验

## 不做
- 退货出库给供应商/集货（发货拒收在 ck-07 已做）
- 退款账务（仅记录退款备注/凭证，ck-10 可扩展）

## 验收
1. 售后退货全流程（发起→审核→收货→回补）可用；部分退货正确
2. 回补批次正确：有分配记录→原批次；无→待检批次且页面标识
3. 审核拒绝终态且不能再收货
4. 数量校验：超出可退数量被拒；无负库存
5. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§5.2/§5.5、附录 B 售后条款、§4.2 return/payments、§6。

---

## 完成情况（ck-09b 实现记录）

**已实现（2025-xx 完成）**

- 发起：`POST /api/v1/sales-orders/:id/returns`（`source_type=SALES`，状态 REQUESTED）——行级退货数量 ≤ 可退数量（该行已发数量 − 已退数量，retroactive 查非 CANCELLED 的 SALES 退货）；原因 + 照片（files 管线，photoFileIds ≤ 9）；仅 SENT / PAYMENT_UPLOADED / CONFIRMED 可发起（否则 SALES_STATE_CONFLICT）；权限 `AFTER_SALE_CREATE` + 买方单元 scope。
- 审核：`POST /api/v1/return-orders/:id/approve|reject`（SALES 分支）——同意 → APPROVED（待收货）；拒绝附理由 → CANCELLED（终态，不可再收货）。权限 `AFTER_SALE_RECEIVE` + 卖方单元 scope。
- 退回收货：`POST /api/v1/return-orders/:id/receive`——实收数量 ≤ 申请数量（可部分收货，0 允许）→ 逐批回补（movements=RETURN_IN，order_type=sales，ref_no=退货单号）→ RETURNED 闭环：
  - 有原批次：按 `sales_batch_allocations`（created_at 顺序）回补原批次，UNIT_COST 取原 OUTBOUND_SALE 流水（`order_id=销售单`）；
  - 无原批次/无法确定：回补/创建「退货待检批次」（`source_type=RETURNS_PENDING`，无生产/到期日期，`batch_no=NULL`），页面 `pendingQc` 标识待质检。
- 前端：`/returns` 增加「发货退货 / 零售售后」来源 Tab；售后列表/详情支持 SALES 来源（销售单号、实收数量、待质检标识、照片）；详情页仓库可审核（同意/拒绝）与收货（逐明细录入实收）；销售单详情新增「售后」面板（记录 + 零售方发起售后表单，含照片上传）。
- 错误码：`RETURN_QTY_EXCEEDED`（shared/src/errors.ts + API 映射 + 前端 i18n），复用 `RETURN_LINE_INVALID` / `RETURN_STATE_CONFLICT` / `RETURN_ALREADY_PROCESSED`。
- 迁移：`packages/db/migrations/0005_early_zarek.sql`（`return_order_items.sales_order_item_id` + `received_qty` + FK/索引；`batch_source_type` ADD VALUE `RETURNS_PENDING`；`return_orders.sales_order_id` 0000 已有，未重复加）。

**改动文件清单**：packages/shared（errors.ts / returns.ts / schemas.ts）、packages/db（schema.ts / enums.ts / migrations.generated.ts / migrations/0005_*.sql + meta）、apps/api（types.ts / repos/sql.ts / repos/memory.ts / lib/dto.ts / routes/return-orders.ts / routes/sales-orders.ts / routes/sales-returns.test.ts）、apps/web（api/http.ts / api/returns.ts / routes/routes.ts / pages/returns/ReturnsListPage.tsx / pages/returns/ReturnDetailPage.tsx / pages/sales/SalesDetailPage.tsx / i18n/resources/zh-CN.ts / en.ts）。

**验证结果**：`pnpm -r typecheck` ✅ 4 包通过；`pnpm -r test` ✅ shared 3 文件 16 用例、db 2 文件 8 用例、api 18 文件 134 用例（新增 sales-returns.test.ts 10 用例）、web 9 文件 40 用例；`pnpm -r build` ✅ shared/db/web/api 全部通过。未连真实 PG，全部基于现有测试基础设施（createMemoryRepos）。

**遗留问题**：退款账务未做（ck-10）；待检批次质检放行流程未在本 checkpoint 实现（仅标识 pendingQc）；未 commit / 未 push。