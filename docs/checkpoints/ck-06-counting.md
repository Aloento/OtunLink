# ck-06（P6）收货点货与差异协商

## 目标
仓库收货点货：应收/实收并排录入、差异显著标记、提交差异修订 → 集货方同意（按实收修订应收）/拒绝（退回重提）；全程审计。

## 范围
- 🔨 `POST /shipments/:id/start-counting` → SENT→COUNTING；列表页进入点货界面
- 🔨 点货：逐行填实收数量（默认=应收），保存 `POST /shipments/:id/count`（可分批保存，草稿）
- 🔨 差异标记：实收≠应收的行红色高亮 + 顶部汇总「N 项存在差异」（应收/实收并排）
- 🔨 提交差异修订：`POST /shipments/:id/reviews` —— 逐差异行填原因+可选照片（复用 files 管线）→ `PENDING`
- 🔨 集货侧处理：工作台「待处理差异」；`POST /reviews/:id/approve` → 该行应收改为实收（写审计 + 快照记录修订前后）；`POST /reviews/:id/reject` → 附理由，返回可修改重提
- 🔨 全部一致时进入待确认收货（ck-07 接「确认收货」）；差异未清零不能确认收货
- 🔨 并发/幂等：点货草稿版本号；重复提交 review 状态守卫
- 🔨 测试：附录 A 时序全流程（含同意/拒绝分支）、差异标记计算、审计写入

## 不做
- 确认收货生成入库单/批次（ck-07）
- 通知（ck-10，此处可留事件桩）

## 验收
1. 点货保存草稿、刷新不丢；实收可大于/小于应收
2. 差异行红色标记 + 汇总正确
3. 提交 review 后集货侧可见；同意→应收修正+审计；拒绝→仓库可重提
4. 差异存在时无法确认收货
5. 权限：仅收货方仓库可点货，仅发货方集货可审批
6. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§5.1、附录 A、§4.2 discrepancy_reviews、§6.1/§6.2。

## 完成情况（ck-06 ✅）

- **后端**：`POST /shipments/:id/start-counting`（SENT→COUNTING）、`POST /shipments/:id/count`
  （逐行实收 + `count_version` 乐观并发 CAS，重算：全一致→READY / 有差异→DISCREPANCY /
  有未点→COUNTING）、`POST /shipments/:id/reviews`（差异修订提交，PENDING 唯一约束）、
  `POST /reviews/:id/approve`（应收:=实收 + 快照审计）、`POST /reviews/:id/reject`（拒绝理由必填）。
- **schema**：`discrepancy_reviews` / `discrepancy_review_items` / `shipment_items.actual_qty`
  / `count_version`（迁移 0003）；`shipment_count` schema 实收允许 0（整箱缺失场景）。
- **前端**：详情页点货面板（逐行实收输入 + 实时差额徽标 + 保存草稿 + 差异修订提交 Dialog：
  逐行原因 + 照片）、物品清单实收列与红色差异高亮 + 顶部汇总警示、差异修订记录区
  （集货方同意/拒绝 Dialog）、工作台「待处理差异」（COLLECTOR）+「待点货」（WAREHOUSE）。
- **测试**：api 76 用例（+20）、web 40、shared 16、db 8，共 140 全绿；`typecheck`/`build` 通过。
- **遗留**：确认收货（ck-07 接 READY 状态）；通知留 ck-10。

