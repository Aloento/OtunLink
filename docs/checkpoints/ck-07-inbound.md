# ck-07（P7）确认入库（批次建档）+ 发货退货

## 目标
差异清零后确认收货 → 自动生成入库单（批次建档：生产/到期日/批号 + 备注 + 入库照片）→ POST 后原价与批次只读；部分/全部拒收 → 发货退货单 → 集货方处理闭环。

## 范围
- 🔨 `POST /shipments/:id/confirm-receipt` → 校验全部行实收=应收（否则 409）；生成 `inbound_orders`（DRAFT）+ 行：物品、数量、unit_cost=发货价快照、**批次信息（production_date/expiry_date/batch_no，按 物品+效期 归并）**；可加备注、上传入库照片（files 管线复用）
- 🔨 `POST /inbound-orders/:id/post`（POST 动作）：
  - **建档 batches**（物品×生产/到期/批号）
  - **生成库存**：单仓 stock 行初始数量，`stock_movements` 写 INBOUND_SHIPMENT（按批次），unit_id=仓库
  - POST 后单据与行**只读**（unit_cost 不可改、批次不可改、仅可加照片/附件）
- 🔨 发货退货：确认收货时（或 POST 前）部分/全部拒收 → `POST /shipments/:id/returns` → `return_orders`（source_type=SHIPMENT，含拒收行数量+原因+照片）→ 集货方 `POST /return-orders/:id/accept|reject` 闭环（接受=冲销该部分、拒绝=退回仓库处理，状态机见 §5.2）
- 🔨 UI：`/inbound` 列表/详情/手动新建占位（手动入库完整逻辑在 ck-08a）；`/returns`（发货拒收 Tab）
- 🔨 测试：confirm→post 后 batches/stock/movements 断言；unit_cost 不可变；拒收→接受/拒绝分支

## 不做
- 手动出入库/报损（ck-08a/08b）
- 售后退货（ck-09b）

## 验收
1. 全部一致才可确认收货；生成入库单且行含批次信息
2. post 后：batches、stock（仓库×物品×批次）、INBOUND_SHIPMENT movements 三者一致，数量校验通过
3. 已 POST 的入库单 unit_cost/批次不可修改（API 拒绝）
4. 拒收流程：发货退货单可创建；集货方接受/拒绝后状态正确，库存侧无脏数据
5. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§5.2/§5.3、§4.2 batches/inbound/return、§8.2 并发、附录 B。

## 完成情况
- 验证结果：`pnpm -r typecheck`、`pnpm -r test`、`pnpm -r build` 全部通过（shared 16 / db 8 / api 90 / web 40 用例；api 新增 inbound.test.ts 6 例 + returns.test.ts 8 例）。
- 实现要点：确认收货 → DRAFT 入库单（行按 物品+生产日+到期日 归并，unit_cost=发货价加权平均快照，批号自动 `${shipmentNo}-B{n}` 或按 shipmentItemId 用户指定）；POST → 建档 batches → upsert stock → 写 INBOUND_SHIPMENT movements，POST 后单据/行只读。发货退货：WAREHOUSE 发起（READY→RETURN_PENDING，PENDING 单）→ COLLECTOR/ADMIN 处理（accept 全退→RETURNED / 部分→INBOUNDED+剩余入 DRAFT 入库单；reject→REJECTED 且发货单回 READY）。
- 遗留/建议：手动入库（source_type=MANUAL）留待 ck-08a；退货被拒后无「修改重提」端点（仓库重建退货单）；RETURN_PENDING 期间未阻止重复发起退货（依赖业务约束）；已 POST 入库单仅可加照片/附件，无编辑端点。
- 权限：INBOUND_CONFIRM=WAREHOUSE；SHIPMENT_RETURNS_CREATE=WAREHOUSE；SHIPMENT_RETURNS_HANDLE=COLLECTOR/ADMIN；scope 校验参照 ck-06 的 canXxx 模式（发货方/收货方业务单元匹配）。
