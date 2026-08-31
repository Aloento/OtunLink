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
