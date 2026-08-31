# ck-09a（P9a）销售单 + 请货 + FEFO 分配

## 目标
零售方请货 / 仓库主动送货 → 销售单（自提/快递等送货方式、行级改价、整单折扣），发送即按 FEFO 分配批次并扣库存；取消回补；支付凭证与确认收货；零售方可查看仓库库存与零售价。

## 范围
- 🔨 销售单：`POST /sales-orders`（来源：retailer 请货 / warehouse 主动）——买方=零售业务单元（预留 B2C 多态 buyer_type/buyer_id，本期固定 RETAILER_UNIT），仓库=卖方单元；场景：`PICKUP`/`EXPRESS`/`LOGISTICS`（自提/快递/物流）+ 收货信息
- 🔨 价格：行级 `unit_price_override`（默认零售价）+ 整单 `discount_percent` + `freight`；金额快照（行/合计），服务端计算
- 🔨 浏览：零售方 `GET /stock?unitId=` + `GET /retail-prices`（只读零售价，不可见成本）
- 🔨 发送：`POST /sales-orders/:id/send` —— 状态 → SENT：
  - **FEFO 分配**：按 `expiry_date ASC` 分配批次（`sales_batch_allocations` 记录），允许手工指定（校验批次有效/余额）
  - 经 StockService 生成 OUTBOUND_SALE 逐批扣减（行锁+余额校验）
- 🔨 取消：`POST /sales-orders/:id/cancel`（SENT 后未确认收货/未支付前）→ 逆回补原批次（OUTBOUND_SALE_REVERSAL）
- 🔨 支付：`POST /sales-orders/:id/payments`（上传支付凭证，files 管线）；`POST /sales-orders/:id/confirm-receipt`（零售确认收货，状态闭环）
- 🔨 UI：`/sales`（我的请货/主动送货 → 创建 → 批次分配预览 FEFO → 发送 → 支付/收货）、`/inventory` 零售只读视图
- 🔨 测试：FEFO 顺序断言（不同到期日分配正确）、手工覆盖、并发扣减、取消回补、价格快照计算（折扣/行改价）

## 不做
- 售后退货（ck-09b）
- 通知发送（ck-10，事件桩即可）

## 验收
1. 请货/自建全流程可用；折扣+行改价金额正确
2. send 后：FEFO/手工批次分配记录正确；逐批 movements=OUTBOUND_SALE；库存扣减与余额校验通过
3. 零售方可见库存与零售价，不可见成本/原价
4. cancel 正确回补原批次；并发下无负库存
5. 支付凭证可传；确认收货状态正确
6. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§5.5、§4.2 sales/payments/allocations、§8.2、附录 B FEFO、§6。

## 完成情况（ck-09a 实现）
- 状态机：DRAFT → SENT（FEFO expiry_date ASC 或手工批次，逐批 OUTBOUND_SALE 扣减，行锁 CAS 防负库存）→ PAYMENT_UPLOADED（支付凭证）→ CONFIRMED（确认收货）；DRAFT/CONFIRMED 不可取消。
- 取消：SENT/PAYMENT_UPLOADED 按原批次 OUTBOUND_SALE_REVERSAL 回补，支付单写 refundNote。
- 金额：服务端计算（行 unit_price_override 默认零售价 + 整单 discount_percent + freight），行/合计快照；零售方不可见 unit_cost。
- 权限：WAREHOUSE（创建/发送/取消/改零售价）、RETAILER（请货/查看库存与零售价/上传支付/确认收货）；scope 按买方或卖方单元过滤（SALES_REQUEST/SALES_CREATE/SALES_SEND/SALES_CANCEL/SALES_PAYMENT/SALES_CONFIRM_RECEIPT）。 **⚠️ 2026-08-31 业务评审废弃/调整**：RETAILER 为外部合作方——零售价**只读**且范围=**已签约仓库**；请货可选仓库=已签约；销售单需有**配送方式+配送单号**（仓库提供、零售只读）；scope 非 ADMIN 必填（见 `docs/qa/rbac-matrix-vs-semantics.md`），实现修复时同步更新。
- 端点：POST/GET /sales-orders、GET/PATCH /sales-orders/:id、POST :id/send、POST :id/cancel、POST :id/payments、POST :id/confirm-receipt；GET /stock?unitId= 与 GET /retail-prices 对零售只读。
- 前端：/sales（我的请货 + 主动送货列表/创建/详情/发送/支付/收货）、/inventory 零售只读视图（无成本列，显示零售价）；i18n zh-CN/en。
- 错误码：复用 INSUFFICIENT_STOCK/STOCK_BATCH_NOT_FOUND；新增 SALES_STATE_CONFLICT/SALES_LINE_INVALID/SALES_NOT_FOUND/SALES_PAYMENT_NOT_FOUND/SALES_ALLOCATION_MISMATCH 等。
- 表：复用迁移 0000 已建 sales_orders/sales_order_items/sales_batch_allocations/payments，无新增迁移。
- 测试：apps/api/src/routes/sales.test.ts 9 个用例（创建校验、价格快照、FEFO 顺序、手工覆盖/错误码、并发发送、取消回补、支付+确认+权限、scope 过滤、零售成本隐藏），全部通过。
- 验证：`pnpm -r typecheck` 通过（EXIT=0）；`pnpm -r test` 通过（shared 16 / db 8 / api 124 / web 40，共 188）；`pnpm -r build` 通过（EXIT=0，web vite + api wrangler dry-run）。
- 遗留：内存仓库 stock qty 以字符串输出（'4'）与 SQL 数值类型差异；RETAILER 无 scope 时只能看自己单元库存（全局场景仅测试用）；售后退货属 ck-09b。
