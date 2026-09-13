import type { SqlExecutor } from '@otunlink/db';
import { describe, expect, it } from 'vitest';

import { createSqlRepos } from './sql';

const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const RETAIL_UNIT = '00000000-0000-4000-8000-000000000004';

function fakeExecutor(rows: Array<Record<string, unknown>>) {
  const statements: string[] = [];
  const exec: SqlExecutor = {
    query: async (statement) => {
      statements.push(statement);
      return { rows };
    },
  };
  return { exec, statements };
}

function partnershipRow(inserted: boolean | string) {
  return {
    id: '00000000-0000-4000-8000-0000000000f1',
    warehouse_unit_id: WAREHOUSE_UNIT,
    retailer_unit_id: RETAIL_UNIT,
    created_by: 'user-1',
    created_at: '2025-01-01T00:00:00.000Z',
    warehouse_unit_name: '仓库一',
    retailer_unit_name: '零售门店一',
    inserted,
  };
}

// Hyperdrive 会缓存只读查询且写入不会使其失效：一旦在写路径上「先读 → 写 → 再读同一对」，
// 读回就可能命中写之前的陈旧结果（曾经表现为「界面报错，但刷新后发现其实已添加成功」）。
// 这两条用例锁定「创建签约只发一条写语句，并由它给出结果」的约定。
describe('SQL 通道：仓库-零售签约创建', () => {
  it('只发一条写语句并直接返回记录（不做写后读）', async () => {
    const { exec, statements } = fakeExecutor([partnershipRow(true)]);
    const repos = createSqlRepos(exec);

    const { record, created } = await repos.partnerships.create({
      warehouseUnitId: WAREHOUSE_UNIT,
      retailerUnitId: RETAIL_UNIT,
      createdBy: 'user-1',
    });

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('INSERT INTO retail_partnerships');
    expect(statements[0]).toContain('RETURNING');
    expect(created).toBe(true);
    expect(record).toMatchObject({
      id: '00000000-0000-4000-8000-0000000000f1',
      warehouseUnitId: WAREHOUSE_UNIT,
      warehouseUnitName: '仓库一',
      retailerUnitId: RETAIL_UNIT,
      retailerUnitName: '零售门店一',
      createdBy: 'user-1',
    });
    expect(record.createdAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('命中已有签约时返回 created=false 且不抛错（幂等重复添加）', async () => {
    for (const flag of [false, 'f', 'false']) {
      const { exec, statements } = fakeExecutor([partnershipRow(flag)]);
      const repos = createSqlRepos(exec);

      const { record, created } = await repos.partnerships.create({
        warehouseUnitId: WAREHOUSE_UNIT,
        retailerUnitId: RETAIL_UNIT,
        createdBy: 'user-1',
      });

      expect(statements).toHaveLength(1);
      expect(created).toBe(false);
      expect(record.id).toBe('00000000-0000-4000-8000-0000000000f1');
    }
  });
});
