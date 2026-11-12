// 列表聚合列（itemCount / totalQty）的回归测试。
//
// 背景：这三条聚合是「子查询」，仓库测试跑的是内存实现，**碰不到真实 SQL**，
// 所以把 `shipment_items.qty` 这种不存在的列写进子查询时，单测全绿、线上 500。
// 这里直接对着拼出来的 SQL 断言列名，把这一类复制粘贴型错误钉住。
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

async function listSql(run: (repos: ReturnType<typeof createSqlRepos>) => Promise<unknown>): Promise<string> {
  const { exec, statements } = fakeExecutor();
  await run(createSqlRepos(exec));
  // statements[0] 是计数，statements[1] 是列表
  expect(statements).toHaveLength(2);
  return statements[1]!;
}

describe('列表聚合子查询只引用真实存在的列', () => {
  it('发货单：数量合计用 actual_qty / expected_qty（shipment_items 没有 qty 列）', async () => {
    const sql = await listSql((repos) => repos.shipments.list({ page: 1, size: 1 }));
    expect(sql).toContain('items_count');
    expect(sql).toContain('total_qty');
    expect(sql).toContain('si.expected_qty');
    expect(sql).toContain('si.actual_qty');
    expect(sql).not.toMatch(/\bsi\.qty\b/);
  });

  it('入库单：数量合计用 inbound_order_items.qty', async () => {
    const sql = await listSql((repos) => repos.inbounds.list({ page: 1, size: 1 }));
    expect(sql).toContain('items_count');
    expect(sql).toMatch(/FROM inbound_order_items (\w+) WHERE \1\.inbound_order_id = io\.id/);
    expect(sql).toMatch(/sum\(\w+\.qty\)/);
  });

  it('出库单：数量合计用 outbound_order_items.qty', async () => {
    const sql = await listSql((repos) => repos.outbounds.list({ page: 1, size: 1 }));
    expect(sql).toContain('items_count');
    expect(sql).toMatch(/FROM outbound_order_items (\w+) WHERE \1\.outbound_order_id = oo\.id/);
    expect(sql).toMatch(/sum\(\w+\.qty\)/);
  });
});
