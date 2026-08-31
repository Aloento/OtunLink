# ck-05（P5）发货单

## 目标
实现发货单创建（集货→仓库）：多物流公司多单号、箱数、物品清单（复用物品、含效期上报）、转交锁定；列表/详情/快照/权限。

## 范围
- 🔨 创建：`POST /shipments` —— 绑定发货方业务单元（集货）与收货方业务单元（仓库）；多物流单号（carrier + tracking_no，唯一约束）；箱数 box_count；清单行：物品（从目录复用，可新增跳转）、数量、价格、单位；**is_perishable 物品必填生产日期+到期日**（多批拆行，UI 引导提示）
- 🔨 转交：`POST /shipments/:id/send` → 状态 DRAFT→SENT（转交后行/价格锁定；收货方可收到通知）
- 🔨 列表/详情：状态、物流单号卡片、清单（含效期列）、箱数、快照（下单时价格快照，见 §4.3）
- 🔨 权限：COLLECTOR 创建/编辑自己单元；SENT 后仅 WAREHOUSE 收货方操作；数据范围 scope 生效
- 🔨 单据编号（§8.4：如 SH-YYYYMM-XXXX）+ 审计桩
- 🔨 测试：创建校验（效期必填/条码/多单号/唯一）、转交状态迁移、权限矩阵用例

## 不做
- 点货/差异/入库（ck-06/ck-07）
- 退货（ck-07 发货拒收 / ck-09b 售后）

## 验收
1. 创建发货单全流程可用；多跟踪号正确保存且重复被拒
2. 清单可搜索复用物品；新物品可从发货单跳转新增（复用 ck-04）
3. 效期字段校验：perishable 缺效期拒绝保存；多批次拆行可用
4. send 后锁定，仓库角色在收货单元可见；非权限角色 403
5. 快照（价格/名称/规格）正确写入
6. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§4.2 发货单/清单、§5.1 状态机、§8.4 编号、附录 B 效期上报、§6 页面与 API。

## 完成情况

✅ 已完成（ck-05）。

- 后端：`POST /shipments`（多物流单号 + 箱数 + 清单复用 + 效期上报）、`GET /shipments`（状态过滤 + 分页 + 物流单号/名称带出）、`GET /shipments/:id`、`PATCH /shipments/:id`（仅 DRAFT）、`POST /shipments/:id/send`（DRAFT→SENT 锁定）。
- 编号：`SH-YYYYMMDD-XXXX`（§8.4），memory 按日计数、SQL 用计数 + 唯一索引兜底。
- 快照：清单写入名称/规格快照；下单价格写入 `unit_price`；转交后不可编辑。
- 权限：读 = `shipments:read`，创建/编辑 = `shipments:create`，转交 = `shipments:transfer`；`scope_unit_id` 数据范围生效（写仅本单元，读命中发货/收货任一方放行）。
- 前端：`/shipments` 列表、`/shipments/:id` 详情（效期列 + 物流单号卡片 + 转交按钮）、`/shipments/new` 与 `/shipments/:id/edit` 表单（单元选择、多物流单号、搜索复用物品、易腐物品逐行效期、跳转新增物品）；i18n 中英同步。
- 测试：`apps/api` shipments 路由 12 用例（创建校验/效期/多单号唯一/转交状态迁移/权限矩阵/数据范围）全部通过。

验证：`pnpm -r typecheck`、`pnpm -r test`、`pnpm -r build` 全部通过（api build = `wrangler deploy --dry-run`）。

遗留：点货/差异/入库按范围交由 ck-06/ck-07；转交后的「收货方通知」沿用既有通知桩（ck-10 落地）。
