// 列表关键字搜索（q）：锁定 SQL 通道的拼装约定——
// ① 单号 ILIKE（大小写不敏感）；② 列表若联表带出了往来单位名，名称也要命中；
// ③ 必须与既有过滤条件 AND 组合；④ 计数查询必须带上判定所需的联表，否则会引用不到的别名。
import type { SqlExecutor } from '@otunlink/db';
import { describe, expect, it } from 'vitest';

import { createSqlRepos } from './sql';

function fakeExecutor() {
  const statements: string[] = [];
  const exec: SqlExecutor = {
    query: async (statement) => {
      statements.push(statement);
      return { rows: [] };
    },
  };
  return { exec, statements };
}

/** 跑一次 list，返回 [计数语句, 列表语句]。 */
async function listStatements(
  run: (repos: ReturnType<typeof createSqlRepos>) => Promise<unknown>,
): Promise<[string, string]> {
  const { exec, statements } = fakeExecutor();
  await run(createSqlRepos(exec));
  expect(statements).toHaveLength(2);
  return [statements[0]!, statements[1]!];
}

describe('SQL 通道：列表关键字搜索 q', () => {
  it('销售单：按单号 ILIKE，且保留 status 过滤', async () => {
    const [count, list] = await listStatements((repos) =>
      repos.sales.list({ status: 'DRAFT', q: ' so-2025 ' }),
    );
    expect(count).toContain('FROM sales_orders');
    expect(count).toContain("status = 'DRAFT'");
    expect(count).toContain("sales_no ILIKE '%so-2025%'");
    expect(list).toContain("so.status = 'DRAFT'");
    expect(list).toContain("so.sales_no ILIKE '%so-2025%'");
  });

  it('发货单：按单号 ILIKE，且保留 scope 过滤', async () => {
    const [count, list] = await listStatements((repos) =>
      repos.shipments.list({ status: 'SENT', scopeUnitId: 'unit-a', q: 'SH-2' }),
    );
    expect(count).toContain("status = 'SENT'");
    expect(count).toContain('shipper_unit_id = \'unit-a\'');
    expect(count).toContain("shipment_no ILIKE '%SH-2%'");
    expect(list).toContain("shipment_no ILIKE '%SH-2%'");
  });

  it('入库单：单号或往来单位名命中；计数查询带上联表', async () => {
    const [count, list] = await listStatements((repos) =>
      repos.inbounds.list({ status: 'DRAFT', warehouseUnitId: 'wh-1', q: '集货' }),
    );
    // 计数查询若不联 business_units cp，cp.name 会指向不存在的表。
    expect(count).toContain('FROM inbound_orders io');
    expect(count).toContain('LEFT JOIN business_units cp ON cp.id = io.counterparty_unit_id');
    expect(count).toContain("io.status = 'DRAFT'");
    expect(count).toContain("io.warehouse_unit_id = 'wh-1'");
    expect(count).toContain("(io.inbound_no ILIKE '%集货%' OR cp.name ILIKE '%集货%')");
    expect(list).toContain("(io.inbound_no ILIKE '%集货%' OR cp.name ILIKE '%集货%')");
  });

  it('出库单：单号或往来单位名命中；计数查询带上联表', async () => {
    const [count, list] = await listStatements((repos) =>
      repos.outbounds.list({ status: 'DRAFT', type: 'LOSS', q: 'OB-1' }),
    );
    expect(count).toContain('FROM outbound_orders oo');
    expect(count).toContain('LEFT JOIN business_units cp ON cp.id = oo.counterparty_unit_id');
    expect(count).toContain("oo.type = 'LOSS'");
    expect(count).toContain("(oo.outbound_no ILIKE '%OB-1%' OR cp.name ILIKE '%OB-1%')");
    expect(list).toContain("(oo.outbound_no ILIKE '%OB-1%' OR cp.name ILIKE '%OB-1%')");
  });

  it('退货单：单号或发起/接收单位名命中；计数查询带上两侧联表', async () => {
    const [count, list] = await listStatements((repos) =>
      repos.returns.list({ status: 'PENDING', q: 'RT-1' }),
    );
    expect(count).toContain('FROM return_orders ro');
    expect(count).toContain('LEFT JOIN business_units fu ON fu.id = ro.from_unit_id');
    expect(count).toContain('LEFT JOIN business_units tu ON tu.id = ro.to_unit_id');
    expect(count).toContain("ro.status = 'PENDING'");
    expect(count).toContain("fu.name ILIKE '%RT-1%'");
    expect(count).toContain("tu.name ILIKE '%RT-1%'");
    expect(list).toContain("ro.return_no ILIKE '%RT-1%'");
  });

  it('库存台账：物品名 / SKU / 条码 / 批次号命中；计数查询自带 items+batches 联表', async () => {
    const [count, list] = await listStatements((repos) =>
      repos.stock.list({ unitId: 'wh-1', q: 'A-1' }),
    );
    // 计数若不自带 JOIN items/batches，i.name、b.batch_no 会指向不存在的表 —— 这正是
    // 之前发货单聚合踩过的坑（单测绿、线上 500），所以这里逐条钉住。
    expect(count).toContain('FROM stock s');
    expect(count).toContain('JOIN items i ON i.id = s.item_id');
    expect(count).toContain('JOIN batches b ON b.id = s.batch_id');
    expect(count).toContain("s.unit_id = 'wh-1'");
    expect(count).toContain(
      "(i.name ILIKE '%A-1%' OR i.sku ILIKE '%A-1%' OR i.barcode ILIKE '%A-1%' OR b.batch_no ILIKE '%A-1%')",
    );
    expect(list).toContain('i.name ILIKE');
  });

  it('库存流水：计数与列表使用同一谓词', async () => {
    const [count, list] = await listStatements((repos) => repos.stock.listMovements({ q: 'B-9' }));
    expect(count).toContain('FROM stock_movements m');
    expect(count).toContain('LEFT JOIN items i ON i.id = m.item_id');
    expect(count).toContain('LEFT JOIN batches b ON b.id = m.batch_id');
    expect(count).toContain("b.batch_no ILIKE '%B-9%'");
    expect(list).toContain("b.batch_no ILIKE '%B-9%'");
  });

  it('空串/纯空白 q 视为未传，不产生 ILIKE', async () => {
    for (const q of ['', '   ']) {
      const [count, list] = await listStatements((repos) => repos.shipments.list({ q }));
      expect(count).not.toContain('ILIKE');
      expect(list).not.toContain('ILIKE');
    }
  });
});
