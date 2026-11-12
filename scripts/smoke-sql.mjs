#!/usr/bin/env node
/**
 * 只读 SQL 冒烟：拿「真实数据库」跑一遍各列表拼接出来的 SQL。
 *
 * 为什么需要它：仓库里的 repo 测试跑的是内存实现（`repos/memory`），
 * 拼错的列名（例如把 shipment_items.expected_qty 写成 qty）在单测里全绿，
 * 到线上才 500 —— 工作台待办就是被这种方式打挂的。
 *
 * 用法：node scripts/smoke-sql.mjs   （从仓库根目录）
 * 连接串取自 apps/api/.dev.vars 的 DATABASE_URL；没有就跳过（退出码 0）。
 * 只执行 SELECT，不写库。
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const devVars = new URL('../apps/api/.dev.vars', import.meta.url);

if (!existsSync(devVars)) {
  console.log('skip: 没有 apps/api/.dev.vars，无法拿到 DATABASE_URL');
  process.exit(0);
}

const match = readFileSync(devVars, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
if (!match) {
  console.log('skip: .dev.vars 里没有 DATABASE_URL');
  process.exit(0);
}

const postgresModule = require('postgres');
const postgres = postgresModule.default ?? postgresModule;
const sql = postgres(match[1].trim(), { ssl: 'require', max: 1, connect_timeout: 20 });

// 与 apps/api/src/repos/sql/*.ts 保持同形：列名/联表/聚合只要有一处对不上，
// PostgreSQL 会直接报 error，这里就能在合并前发现。
const queries = {
  'shipments.list（含 items_count/total_qty 聚合）': `SELECT s.*,
      (SELECT count(*)::int FROM shipment_items si WHERE si.shipment_id = s.id) AS items_count,
      (SELECT COALESCE(sum(COALESCE(si.actual_qty, si.expected_qty)), 0) FROM shipment_items si WHERE si.shipment_id = s.id) AS total_qty
    FROM shipments s ORDER BY s.created_at DESC LIMIT 1`,
  'inbounds.list（含聚合）': `SELECT io.*, bu.name AS warehouse_name, cp.name AS counterparty_name, s.shipment_no,
      (SELECT count(*)::int FROM inbound_order_items li WHERE li.inbound_order_id = io.id) AS items_count,
      (SELECT COALESCE(sum(li.qty), 0) FROM inbound_order_items li WHERE li.inbound_order_id = io.id) AS total_qty
    FROM inbound_orders io
    LEFT JOIN business_units bu ON bu.id = io.warehouse_unit_id
    LEFT JOIN business_units cp ON cp.id = io.counterparty_unit_id
    LEFT JOIN shipments s ON s.id = io.shipment_id
    ORDER BY io.created_at DESC LIMIT 1`,
  'outbounds.list（含聚合）': `SELECT oo.*, bu.name AS warehouse_name, cp.name AS counterparty_name,
      (SELECT count(*)::int FROM outbound_order_items lo WHERE lo.outbound_order_id = oo.id) AS items_count,
      (SELECT COALESCE(sum(lo.qty), 0) FROM outbound_order_items lo WHERE lo.outbound_order_id = oo.id) AS total_qty
    FROM outbound_orders oo
    LEFT JOIN business_units bu ON bu.id = oo.warehouse_unit_id
    LEFT JOIN business_units cp ON cp.id = oo.counterparty_unit_id
    ORDER BY oo.created_at DESC LIMIT 1`,
  'sales.list（含 has_payment）': `SELECT so.*, EXISTS (SELECT 1 FROM payments p WHERE p.sales_order_id = so.id) AS has_payment
    FROM sales_orders so ORDER BY so.created_at DESC LIMIT 1`,
  'returns.list（含双方单位名）': `SELECT ro.*, fu.name AS from_unit_name, tu.name AS to_unit_name, s.shipment_no, so.sales_no AS sales_order_no
    FROM return_orders ro
    LEFT JOIN business_units fu ON fu.id = ro.from_unit_id
    LEFT JOIN business_units tu ON tu.id = ro.to_unit_id
    LEFT JOIN shipments s ON s.id = ro.shipment_id
    LEFT JOIN sales_orders so ON so.id = ro.sales_order_id
    ORDER BY ro.created_at DESC LIMIT 1`,
  'items.list（搜索谓词涉及的列）': `SELECT id, name, sku, barcode, category, status FROM items
    WHERE name ILIKE '%a%' OR sku ILIKE '%a%' ORDER BY updated_at DESC LIMIT 1`,
  // 下面四条与 apps/api/src/repos/sql/stock.ts 同形：计数与列表必须用同一套 JOIN，
  // 关键词谓词同时引用 items/batches —— 少一个 JOIN 就会在线上变成「列不存在」。
  'stock.list count（含 items+batches 联表）': `SELECT count(*)::int AS n
    FROM stock s
    JOIN items i ON i.id = s.item_id
    JOIN batches b ON b.id = s.batch_id
    WHERE s.qty > 0 AND (i.name ILIKE '%a%' OR i.sku ILIKE '%a%' OR i.barcode ILIKE '%a%' OR b.batch_no ILIKE '%a%')`,
  'stock.list（库存 + 关键词）': `SELECT s.*, bu.name AS unit_name, i.name AS item_name,
      CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END AS spec,
      i.min_sale_unit AS min_sale_unit,
      b.batch_no, b.production_date, b.expiry_date
    FROM stock s
    JOIN business_units bu ON bu.id = s.unit_id
    JOIN items i ON i.id = s.item_id
    JOIN batches b ON b.id = s.batch_id
    WHERE s.qty > 0 AND (i.name ILIKE '%a%' OR i.sku ILIKE '%a%' OR i.barcode ILIKE '%a%' OR b.batch_no ILIKE '%a%')
    ORDER BY bu.name ASC, i.name ASC, b.expiry_date ASC NULLS LAST, s.batch_id ASC
    LIMIT 1`,
  'stock.listMovements count（含 items+batches 联表）': `SELECT count(*)::int AS n
    FROM stock_movements m
    LEFT JOIN items i ON i.id = m.item_id
    LEFT JOIN batches b ON b.id = m.batch_id
    WHERE (i.name ILIKE '%a%' OR i.sku ILIKE '%a%' OR i.barcode ILIKE '%a%' OR b.batch_no ILIKE '%a%')`,
  'stock.listMovements（流水 + 关键词）': `SELECT m.*, bu.name AS unit_name, i.name AS item_name,
      CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END AS spec,
      i.min_sale_unit AS min_sale_unit, b.batch_no
    FROM stock_movements m
    LEFT JOIN business_units bu ON bu.id = m.unit_id
    LEFT JOIN items i ON i.id = m.item_id
    LEFT JOIN batches b ON b.id = m.batch_id
    WHERE (i.name ILIKE '%a%' OR i.sku ILIKE '%a%' OR i.barcode ILIKE '%a%' OR b.batch_no ILIKE '%a%')
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1`,
};

let failed = 0;
for (const [label, query] of Object.entries(queries)) {
  try {
    await sql.unsafe(query);
    console.log(`ok    ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${label}\n      ${error.message}`);
  }
}

await sql.end();
console.log(failed === 0 ? '\nSQL 冒烟全部通过' : `\n${failed} 条 SQL 失败`);
process.exit(failed === 0 ? 0 : 1);
