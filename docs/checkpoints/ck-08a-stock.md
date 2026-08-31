# ck-08a（P8a）库存台账 + 手动出入库

## 目标
建立只增不改删的按批次库存台账；手动入库单/出库单（说明交易对手/清单/备注）走同一库存服务与行锁；所有数量变化只能经业务入口。

## 范围
- 🔨 `stock_movements` 台账（append-only，禁止 UPDATE/DELETE——DB 层权限/触发器或服务层强约束）：类型 INBOUND_MANUAL / OUTBOUND_NORMAL（其余类型由 ck-07/08b/09 接入），每行含 unit×item×batch、数量、单价、关联单据、操作人、时间
- 🔨 库存服务 `StockService.*`：`applyMovement`（事务 + `SELECT ... FOR UPDATE` 按 (unit,item,batch) 行锁 + 余额校验：出库不可超余额）、`getStock`、`getMovements`；**所有单据 post 必须经此服务**
- 🔨 手动入库单：`POST /inbound-orders`（手动类型，指定仓库/交易对手/行（物品+批次或建档）/单价/备注）→ post → INBOUND_MANUAL
- 🔨 手动出库单：`POST /outbound-orders`（普通类型，指定仓库/交易对手/行（物品+批次）/数量/备注）→ post → OUTBOUND_NORMAL（校验余额）；草稿可编辑
- 🔨 UI：`/inventory`（按仓库：物品汇总 + 批次明细 + 台账入口）、`/inbound`（手动 Tab）、`/outbound`（普通 Tab）；响应式列表
- 🔨 测试：并发扣减（两请求同批）仅一成功；超余额被拒；台账不可改；正/负数量校验

## 不做
- 报损/效期/零售价（ck-08b）；销售（ck-09a）；退货回补（ck-09b）

## 验收
1. 手动入库/出库全流程：草稿→post→movements+stock 一致
2. 出库超余额/并发冲突被正确拒绝（409/400），无负库存
3. 直接改数据库 stock 或 movements 的路径不存在（代码审查确认只经 StockService）
4. 台账可按 单据/批次/时间 过滤；分页 ≤50
5. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§4.2 stock/movements、§4.3 铁律、§5.6 统一入口、§8.2 并发。
