# ck-08b（P8b）报损 + 效期预警 + 零售价

## 目标
报损单（原因+附图，必须指定批次）；库存页效期着色与过期批次扫描/一键报损；每日 Cron 效期预警；仓库独立零售价（含历史，原价不可改）。

## 范围
- 🔨 报损单：`POST /outbound-orders`（type=LOSS）——原因必填、≥1 张附图（files 管线）、行必须指定批次 → post → OUTBOUND_LOSS（经 StockService）
- 🔨 效期：`GET /stock/expired?unitId=`（已过期批次）；`GET /stock/batches`（列出 有效期/剩余天数）；库存页效期列：≤30 天黄、已过期红；「已过期」Tab + 一键生成报损单（原因预填「过期」，行预填过期批次数量，可调整）
- 🔨 Cron：Worker `scheduled` 每日触发——扫描 7 天内到期 → 生成站内通知记录（发送端 ck-10 联接，本 checkpoint 先写 notifications 表）；扫描已过期 → 通知仓库
- 🔨 零售价：`retail_prices`（unit×item 当前价）+ 历史表 `GET /retail-prices/:unitId/:itemId/history`；`GET/PUT /retail-prices`；仓库可自由改零售价；**unit_cost 原始进价不可修改/不可经此接口暴露编辑**（只读展示）
- 🔨 UI：`/outbound`（报损 Tab）、`/inventory` 效期视图与零售价入口、`/admin` 或仓库设置页零售价管理
- 🔨 测试：报损校验（原因/图/批次/余额）、过期计算（时区 UTC 规则 §11.7）、价格历史与不可变性

## 不做
- 销售/FEFO（ck-09a）；售后（ck-09b）；邮件发送（ck-10 接 bridge）

## 验收
1. 报损单必须原因+图+批次；post 后 movements=OUTBOUND_LOSS，库存减少
2. 过期批次可见且一键报损可用（预填正确）；效期着色正确
3. Cron 可手动触发（wrangler dev 发送 scheduled 事件）产生预警记录
4. 零售价修改有历史；原进价在任何接口/页面不可修改
5. `pnpm -r typecheck && pnpm -r test && pnpm -r build` 通过

## 参考
design.md：§5.4、§4.2 retail_prices、附录 B、§8.2、§11 风险 5/7。

---

## 完成情况（ck-08b 实现记录）

### 已实现
- **报损单**：`POST /outbound-orders`（type=LOSS）——loss_reason 必填、≥1 张附图（复用 files/ImageUpload 管线）、每行必须指定 batchId；POST 过账走 OUTBOUND_LOSS 流水（表/枚举已存在于迁移，无新迁移）。
- **效期接口**：`GET /stock/batches`（含 productionDate/expiryDate/remainingDays/isExpired）、`GET /stock/expired?unitId=`（无 unitId 且无 scope 时 400）。
- **库存页**：效期列 ≤30 天黄色、已过期红色；「已过期」Tab + 一键生成报损单（原因预填「过期」，行预填过期批次数量，可调整）。
- **Cron**：Worker `scheduled` 每日触发 `runExpiryScan`——7 天内到期→EXPIRY_ALERT 通知（按仓库聚合），已过期→通知对应仓库；写 notifications 表（表已存在，无新迁移）。
- **零售价**：`GET/PUT /retail-prices`（unit×item 当前价，currency 默认 CNY）、`GET /retail-prices/:unitId/:itemId/history`；仓库可自由改价并写 retail_price_history（updated_by/at）；unit_cost 服务端只读计算（加权平均进价），任何接口/页面不可修改。
- **权限**：STOCK_READ（库存/效期）、STOCK_WRITE（报损）、RETAIL_PRICES_READ（读）、RETAIL_PRICES_WRITE（写，WAREHOUSE/ADMIN）；全部接口按 scope_unit_id 过滤。
- **前端**：/outbound 报损 Tab（原因+附图+按批次选行，支持 ?type=LOSS&warehouseUnitId&reason&prefill 预填）、/inventory 效期着色+「已过期」Tab+一键报损+零售价入口、/retail-prices 零售价管理页（改价+历史 Dialog）。
- **i18n**：zh-CN/en 键已补齐（outbound/inventory/retailPrices/nav）。
- **测试**：新增 `routes/outbound-loss.test.ts`、`routes/stock-expiry.test.ts`、`routes/retail-prices.test.ts`、`lib/expiry-scan.test.ts`。

### 验收
- `pnpm -r typecheck`：通过（db/shared/api/web，exit 0）。
- `pnpm -r test`：shared 16、db 8、api 16 文件/115 用例、web 9 文件/40 用例，全部通过。
- `pnpm -r build`：通过（含 api wrangler deploy --dry-run、web vite build）。

### 说明
- 未新增数据库迁移：outbound_orders(loss_reason/photo_file_ids)、stock_movements(OUTBOUND_LOSS)、retail_prices、retail_price_history、notifications 均已存在（0000_majestic_alice.sql）。
- 未新增错误码：复用 VALIDATION_ERROR / FORBIDDEN / NOT_FOUND / INSUFFICIENT_STOCK / STOCK_BATCH_NOT_FOUND 等。
- 未 commit / push。

