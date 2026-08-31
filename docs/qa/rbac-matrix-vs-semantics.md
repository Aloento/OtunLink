# 角色权限模型偏差评审记录（RBAC Matrix vs 业务语义）

> 日期：2026-08-31（本地 UI 验收期间发现）
> 提出：用户（业务方）｜ 记录：agent
> 状态：**语义已确认（2026-08-31 晚）→ 待实现**（未改代码，仅记录与理清文档）
> 关联：`docs/design.md` §1.3/§1.4/§3.2/§3.3/附录 C、§11.10；`docs/qa/ui-acceptance.md` §8.1

> 2026-08-31 晚更新：业务方已逐条确认 §5 全部开放问题（见 §1.1），并补充两项新需求：**仓库-零售签约关系**、**销售单配送方式与单号**。

## 1. 业务语义（用户权威表述）

用户（业务方）明确：

1. **零售角色（RETAILER）是给其他外部合作方的，也就是商铺买家**，不是公司员工；
   - 它们**不可以管理零售价**；
   - 它们**看不了发货单**；
   - 它们**只能请货、付款、退货等**；
   - 它们**只能看到各个仓库的库存，然后请货**。
2. **仓库角色（WAREHOUSE）才是可以修改零售价的角色**；
   - 仓库角色**只能管理自己归属的仓库**，不能管理别人的仓库。
3. **集货方（COLLECTOR，发货方）只能管自己的发货单**。

### 1.1 开放问题确认结果（2026-08-31 晚，业务方答复）

| # | 原待确认问题 | 确认结果 |
|---|---|---|
| 1 | 零售能否只读查看零售价？ | **可以只读**（只读仓库提供的零售价；范围=已签约仓库） |
| 2 | 零售能否新增/编辑物品？ | **不能**；零售**无法管理物品列表**（仅 ITEMS_READ 浏览/搜索/扫码复用） |
| 3 | 物流单号是否随发货单一并不可见？ | **是**；零售**看不到发货单的单号**。但**销售单**中需有仓库提供的**独立的配送方式与单号**（如自提、快递等）供零售查看 |
| 4 | scope 语义：「空=全量」是否废除？多仓归属？ | **仓库、集货、零售都必须绑定归属单元**；**一个账户只能绑定一个实体**（不允许一个账号管理多个仓库/集货地/门店）；**一个实体可有多个账户**（如一个仓库多个仓管）；仅 ADMIN 不受限 |
| 5 | 零售可见仓库范围？ | **需与仓库方签约**才能看到该仓库库存：如匈牙利零售需与匈牙利仓库签约；**签约只能由仓库主动发起**，零售方**无需同意**——仓库将零售「添加进销售方列表」即生效；否则零售不会默认看到别国仓库库存 |
| 6 | 外部合作方账号来源？ | **与内部其他用户一致**：由公司创建 Entra 账号（同租户），仅岗位为 RETAILER，无特殊 B2B 来宾流程 |

**新增需求（随确认提出）**：
- **仓库-零售签约（供货）关系**：仓库主动维护「可售客户（零售门店）」列表；零售的库存/零售价/可选仓库 = 已签约仓库集合。
- **销售单配送信息**：仓库（卖方）在销售单上提供**配送方式 + 配送单号**；零售只读查看（独立于发货单物流单号）。

## 2. 三方对照表

| 能力 | 设计文档 design.md（修订前 §3.2） | 实现 ROLE_PERMISSIONS | 业务语义（已确认） | 判定 |
|---|---|---|---|---|
| RETAILER 查看/管理零售价 | ✓ 只读 | `RETAIL_PRICES_READ` | **只读**仓库提供的零售价（范围=已签约仓库） | ⚠️ 保留只读，但**查询范围改为已签约仓库** |
| RETAILER 查看发货单 | 只读 | `SHIPMENTS_READ` | **不可见**（发货单单号也不可见） | ❌ 需移除 |
| RETAILER 物流单号（发货单） | ✓ | `TRACKINGS_MANAGE` | 不可见；**销售单**需有独立的配送方式+单号 | ❌ 移除 `TRACKINGS_MANAGE`；新增销售单配送字段 |
| RETAILER 新增/编辑物品 | ✓ | `ITEMS_WRITE` | **无法管理物品列表** | ❌ 需移除 `ITEMS_WRITE` |
| RETAILER 库存查看 | ✓ 只读 | `STOCK_READ` | 只能看到**已签约仓库**的库存 | ⚠️ 保留只读，范围=已签约仓库（见问题 5/7） |
| RETAILER 请货/支付/确认收货/售后发起 | ✓ | `SALES_REQUEST/CREATE/PAYMENT/CONFIRM_RECEIPT/AFTER_SALE_CREATE` | 只能请货、付款、退货等；请货可选仓库=已签约 | ✅ 一致（+ 范围=已签约） |
| RETAILER 发送/取消销售单 | 草稿 | 无 `SALES_SEND/CANCEL` | 只能请货 | ✅ 一致 |
| WAREHOUSE 修改零售价 | ✓ | `RETAIL_PRICES_READ/WRITE` | **仓库才是改零售价的角色** | ✅ 一致（本项实现正确） |
| WAREHOUSE/COLLECTOR/RETAILER 绑定归属单元 | — | scope 可空（空=全量） | **必须绑定**；一个账户只能绑定一个实体（实体可多账户）；仅 ADMIN 例外 | ❌ 冲突（见问题 4） |
| WAREHOUSE 只能管理自己归属的仓库 | — | scope 语义：「空 = 全量」 | 只能管理自己归属的仓库 | ❌ 冲突（见问题 4） |
| COLLECTOR 只能管自己的发货单 | — | scope 语义：「空 = 全量」；写/读均放行 | 只能管自己的发货单 | ❌ 冲突（见问题 4） |
| 仓库-零售签约关系 | （无此概念） | （无） | 仓库主动添加零售为可售客户；零售库存/零售价/可选仓库=已签约 | 🆕 新设计项（见问题 8） |
| WAREHOUSE 收货/库存/出入库/报损/售后审核 | ✓ | `COUNTING_WRITE/REVIEWS_SUBMIT/INBOUND_CONFIRM/SHIPMENT_RETURNS_CREATE/STOCK_READ/WRITE/AFTER_SALE_RECEIVE` | 未否定 | ✅ 暂一致 |
| COLLECTOR 发货单创建/转交/差异审批/退货处理 | ✓ | `SHIPMENTS_READ/CREATE/TRANSFER/REVIEWS_APPROVE/SHIPMENT_RETURNS_HANDLE` | 未否定 | ✅ 暂一致 |

## 3. 详细问题清单

### P1（已确认冲突，必修 —— 2026-08-31 晚已全部确认）

| # | 问题 | 证据（实现位置） | 影响 | 确认结论 / 修复方向 |
|---|---|---|---|---|
| 1 | **外部合作方（RETAILER）可进入发货单**：`SHIPMENTS_READ` + `TRACKINGS_MANAGE` 授予了 RETAILER，前端路由 `/shipments`（`apps/web/src/routes/routes.ts` 要求 `SHIPMENTS_READ`）对零售可见；发货单是「集货 → 仓库」的内部单据 | `packages/shared/src/auth.ts` §86-99 | 商业信息泄漏：商铺买家可看其他合作方的内部发货单据、物流单号、箱数 | ✅ 确认：从 `ROLE_PERMISSIONS.RETAILER` 移除 `SHIPMENTS_READ`、`TRACKINGS_MANAGE`；前端发货单导航对零售不可见 |
| 2 | **RETAILER 有 `ITEMS_WRITE`**：外部合作方可以新增/编辑全局物品目录 | `auth.ts` §88 | 外部合作方可污染全局共享目录（名称/条码/规格/图片） | ✅ 确认：移除 `ITEMS_WRITE`（仅保留 `ITEMS_READ`）；目录维护 = 内部角色（COLLECTOR/WAREHOUSE/ADMIN） |
| 3 | **RETAILER 有 `RETAIL_PRICES_READ`**：可查看零售价 | `auth.ts` §92；`apps/api/src/routes/retail-prices.ts` (`scopeAllows`)；`apps/web/src/routes/routes.ts` `retailPrices` | 只读是否允许 | ✅ 确认：**保留只读**（仓库提供的零售价），但查询范围改为**已签约仓库**（见 P0 #7） |
| 4 | **「scope 空 = 全量」导致越权 + 未强制归属**：`approver`/`scopeAllows` 类检查在 `scope_unit_id` 为 NULL 时全部放行（如 `shipments.ts` §519-532 `return !scopeUnitId || ...`、`retail-prices.ts` §100-102、`inbound/outbound/reviews/return-orders` 同理） | `apps/api/src/routes/*`；`apps/api/src/auth/middleware.ts` | 未绑 scope 的仓管/集货/零售可操作**所有**对象 | ✅ 确认：**仓库/集货/零售必须绑定归属单元**；**一个账户只能绑定一个实体**（实体可多账户）；仅 ADMIN 可空（全量）。实现 = 非 ADMIN 强制 scope 非空（创建/编辑/查询校验） |
| 5 | **零售库存/零售价查询被自身门店 scope 过滤**：`stock.ts` §28 `unitId: unitId || scope?.unitId`、`retail-prices.ts` §100-102 —— 当 RETAILER scope=ST-XX 且不传 `unitId` 时，只查得到自己门店（零售单元）的库存/零售价（实际无货），**看不到已签约仓库** | `apps/api/src/routes/stock.ts:28`；`retail-prices.ts:100-102` | 零售方库存页/零售价页恒为空 —— 实测 R01 即为空（部分因数据未 seed，但即使 seed 了仓库库存，scope 兜底也会过滤掉） | ✅ 确认：零售的 `STOCK_READ/RETAIL_PRICES_READ` 查询按**已签约仓库**范围（不复用自身门店 scope 过滤；`hideCost` 保留） |
| 6 | **前端权限回归风险**：`access.ts` 为 OR 语义、`routes.ts` 中 `shipments` 路由只要求 `SHIPMENTS_READ`，移除 RETAILER 权限后需复验 C/W 不受影响 | `apps/web/src/routes/access.ts`；`routes.ts` | 修复时回归 | 修复后跑 A06/C01-C08/W01-W16 权限回归 |

### P0（新增需求，随确认提出 —— 需设计 + 实现）

| # | 需求 | 说明 | 建议模型 |
|---|---|---|---|
| 7 | **仓库-零售签约（供货）关系** | 零售只能看到**已签约仓库**的库存/零售价；请货时可选仓库 = 已签约集合；**签约只能由仓库主动发起**（零售无需同意），仓库把零售「添加进可售客户列表」即生效；避免零售默认看到别国/未签约仓库库存 | 新表（如 `retail_partnerships` / `warehouse_customers`）：`warehouse_unit_id`、`retailer_unit_id`、`created_by`、`created_at`，唯一约束 (warehouse, retailer)；WAREHOUSE 角色仅可维护**自己归属仓库**的客户列表；无确认状态机 |
| 8 | **销售单配送信息（仓库提供，零售只读）** | 仓库（卖方）在销售单上提供**配送方式 + 配送单号**（如自提、快递等）；零售可查看（独立于发货单物流单号） | `sales_orders` 已有 `delivery_method`（`PICKUP/EXPRESS/LOGISTICS`）；**需新增** `carrier`（物流商）+ `tracking_no`（配送单号）字段（可空；发送/发货时仓库填写）；零售详情页展示 |

### P2（文档/语义不一致，需修订）

| # | 问题 | 位置 | 处理 |
|---|---|---|---|
| 7 | §1.3「**仅公司内部使用**」——与「零售 = 外部合作方」矛盾 | `docs/design.md` §1.3（修订前 §29） | ✅ 已修订（见 design.md v1.2） |
| 8 | 名词表未区分「外部合作方」 | §1.4 | ✅ 已修订 |
| 9 | §3.2 矩阵 RETAILER「发货单只读」「物流单号 ✓」「零售价只读」与业务语义不符（**checkpoint 按此实现的根源**） | §3.2 | ✅ 已修订（2026-08-31 晚确认：发货单/物流单号 ✗、零售价只读=已签约仓库） |
| 10 | 附录 C 权限矩阵为空骨架 | §628-630 | ✅ 已补全 |
| 11 | checkpoint 文档记录的是**旧（错误）矩阵**：`ck-03-shell.md` §45（"RETAILER 可读 /shipments"）、`ck-04-items.md` §36（"ITEMS_WRITE 全角色"）、`ck-09a-sales.md` §37-39（"零售可查看库存与零售价"） | `docs/checkpoints/*` | ✅ 语义已确认（2026-08-31 晚）：ck 文档需标注「该描述与 2026-08-31 业务语义不符，已废弃」，避免后续按旧矩阵实施；实现修复时一并更新 |
| 12 | §1.5「外部公司接入」列为 MVP 不含，与「零售=外部合作方」表述冲突 | §1.5 §73 | ✅ 已修订加注 |
| 13 | 验收计划 §3.3 R01 预期「查看仓库库存/零售价：只读」基于旧矩阵；§3.2 W10「零售价管理」属仓库（与业务语义一致） | `docs/qa/ui-acceptance.md` §3.3 | ✅ 已加注（见 §8.1） |

## 4. 受影响范围

**实现文件（修复时改动）**：
- `packages/shared/src/auth.ts`（ROLE_PERMISSIONS 核心：RETAILER 移除 `ITEMS_WRITE/SHIPMENTS_READ/TRACKINGS_MANAGE`）
- `apps/api/src/routes/stock.ts`、`retail-prices.ts`、`shipments.ts`、`sales-orders.ts`、`inbound-orders.ts`、`outbound-orders.ts`、`reviews.ts`、`return-orders.ts`（scope 语义 + 签约范围）
- `packages/db`（新增签约关系表 + `sales_orders.carrier/tracking_no` 迁移；`packages/db/src/enums.ts`、`packages/shared/src/sales.ts` 同步类型）
- `apps/web/src/routes/routes.ts`、`access.ts`（前端路由权限 + 零售销售单详情配送信息展示）
- `apps/api/src/auth/middleware.ts`（非 ADMIN 强制 scope 非空 + 单实体归属校验）

**对应 checkpoint（旧矩阵描述，需在修复后更新）**：
- `docs/checkpoints/ck-03-shell.md`（§45 RETAILER 可读 /shipments —— 错误）
- `docs/checkpoints/ck-04-items.md`（§36 ITEMS_WRITE 全角色 —— 已确认移除写权限）
- `docs/checkpoints/ck-09a-sales.md`（§37-39 零售可查看库存与零售价 —— 范围改为已签约仓库 + 销售单配送单号）

**验收计划影响**：
- §3.3 R 链路（R01-R06）**暂停**；语义已确认（已签约仓库 + 销售单配送单号），待实现后重写预期再验
- §3.2 W10（零售价管理）预期不变（仓库负责改价 —— 与业务语义一致）

## 5. 待确认问题 —— 已全部确认（2026-08-31 晚）

| # | 问题 | 确认结论 |
|---|---|---|
| 1 | 零售能否查看零售价（只读）？ | ✅ 零售**只读**仓库提供的零售价（范围 = 已签约仓库） |
| 2 | 零售能否新增/编辑物品？ | ❌ **不能**；仅浏览/搜索/扫码（`ITEMS_READ`） |
| 3 | 零售/集货对物流单号？ | 零售**看不到发货单**，故物流单号不可见；但**销售单**需有仓库提供的独立**配送方式 + 配送单号**（自提/快递等）供零售查看 |
| 4 | 仓库/集货/零售的 scope 语义？ | **必须绑定归属单元**；一个账户只能绑定一个实体（一账号 = 一仓库/一集货地/一门店）；一个实体可有多个账户；仅 ADMIN 可空/全量 |
| 5 | 零售看到的「各仓库库存/零售价」范围？ | **已签约仓库**（签约由**仓库主动发起**：加入可售客户列表即生效，零售无需同意）；否则不默认可见别国/未签约仓库 |
| 6 | 外部合作方账号来源？ | **公司为其创建 Entra 账号**（与内部用户一致），无特殊 B2B 来宾流程 |

## 6. 处理决定（2026-08-31）

- **本轮不实现代码**；只记录问题 + 修订设计文档（design.md v1.2：§1.3/§1.4/§3.2/§3.3/附录 C/§11.10）—— 已完成。
- **验收暂停项**：R01-R06（R 链路）——等角色语义修复完成后再验。
- 下次实施顺序建议（待用户确认开工）：
  1. 修订 `ROLE_PERMISSIONS`（RETAILER 移除 `ITEMS_WRITE/SHIPMENTS_READ/TRACKINGS_MANAGE`）+ 前端路由
  2. 修订 scope 语义：非 ADMIN 强制绑定归属单元（一个账户只能绑定一个实体）；修 `scopeAllows` 系列（空 scope 不再放行）
  3. 设计并实现**仓库-零售签约关系**（新表；WAREHOUSE 主动添加客户；零售库存/零售价/可请货仓库 = 已签约集合）
  4. 销售单增加**配送方式 + 配送单号**字段（仓库填写、零售只读）
  5. 更新 ck-03/ck-04/ck-09a 描述 + 补充单元测试（`hasPermission` 断言 + API scope 越权用例）
  6. 复验 A06/C/W/R 权限回归，再继续 R 链路验收
