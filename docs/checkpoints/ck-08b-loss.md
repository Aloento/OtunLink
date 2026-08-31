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
