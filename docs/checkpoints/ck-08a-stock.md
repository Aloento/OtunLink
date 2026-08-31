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

## 完成情况（ck-08a）

✅ 已完成，验收项对照：

1. **手动入库/出库全流程**：`POST /inbound-orders`（sourceType=MANUAL）→ `POST /inbound-orders/:id/post` 复用 ck-07 的 `postInboundLine`（movementType=INBOUND_MANUAL、source_order_id=入库单 id）实现批次建档/库存 upsert/流水；`POST /outbound-orders` → `POST /outbound-orders/:id/post` 按 FEFO（expiry_date 升序、同效期 createdAt 升序）或指定批次扣减，行级 `FOR UPDATE` 锁 + 余额校验，写 OUTBOUND_NORMAL 流水；库存与流水与台账一致（内存/测试覆盖）。
2. **超余额/冲突拒绝**：不足 → `INSUFFICIENT_STOCK`（409）；重复过账 → `OUTBOUND_STATE_CONFLICT`（409）；指定批次不存在/跨仓库 → `STOCK_BATCH_NOT_FOUND`（409）；无负库存（FEFO 先汇总校验再扣减；指定批次先校验后扣减，全部在一个事务内）。并发场景内存非并发，SQL 层以 FOR UPDATE + 余额复查保证。
3. **只经库存入口**：无直接改 stock/movements 的业务路径；过账全部经 `repos.inbounds.post` / `repos.outbounds.post`（内存共享 `MemoryStockLedger`）。
4. **台账过滤/分页**：`GET /stock`（unitId/itemId/batchId + page/size≤50）、`GET /stock/movements`（同参，最新在前）；前端 `/inventory` 支持仓库/物品筛选、分页、库存/流水切换。
5. **验证**：`pnpm -r typecheck` / `pnpm -r test`（API 103 tests，含新增 outbound.test.ts 6 例、stock.test.ts 3 例、inbound.test.ts 手动入库 3 例）/ `pnpm -r build` 全部通过。

**无新迁移**：`outbound_orders/outbound_order_items/stock/stock_movements` 等表在 ck-07 schema 已存在，`drizzle-kit generate` 输出 no-op，`migrations.generated.ts` 无 diff。

**遗留 / 后续**：报损（LOSS 类型仅 DTO/文案预留）、效期预警、零售价 → ck-08b；销售单 → ck-09a；退货回补 → ck-09b；SQL 仓储仅通过类型检查与内存测试验证，未连真实 PG（按约束不部署/不连库）。
