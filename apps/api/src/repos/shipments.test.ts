import type { SqlExecutor } from '@otunlink/db';
import { describe, expect, it } from 'vitest';

import { createSqlRepos } from './sql';

const SHIPMENT_ID = '00000000-0000-4000-8000-0000000000a1';
const ITEM_ID = '00000000-0000-4000-8000-000000000011';

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

// shipment_items 不存 name/spec（改名后清单必须立刻反映）。这里锁定 SQL 通道约定：
// 写路径不写名称/规格，读路径联表 items 带出，避免快照列被重新引入。
describe('SQL 通道：发货单清单的名称/规格来源', () => {
  it('创建发货单不写入 name/spec 列', async () => {
    const { exec, statements } = fakeExecutor([
      { id: SHIPMENT_ID, shipment_no: 'SH-20250101-0001', created_at: '2025-01-01T00:00:00.000Z' },
    ]);
    const repos = createSqlRepos(exec);

    await repos.shipments.create({
      shipperUnitId: 'unit-a',
      receiverUnitId: 'unit-b',
      boxesCount: 1,
      currency: 'CNY',
      expectedArrivalDate: null,
      remark: null,
      createdBy: 'user-1',
      trackings: [],
      items: [
        {
          itemId: ITEM_ID,
          expectedQty: '5',
          unitPrice: null,
          productionDate: null,
          expiryDate: null,
          lineNote: null,
        },
      ],
    });

    const insert = statements.find((s) => s.includes('INSERT INTO shipment_items'));
    expect(insert).toBeDefined();
    // 插入列清单里不得出现 name / spec（不能用整句断言：item_id 含 "item"）。
    const columns = insert?.slice(insert.indexOf('(') + 1, insert.indexOf(')'));
    expect(columns).not.toMatch(/\bname\b/);
    expect(columns).not.toMatch(/\bspec\b/);
  });

  it('读取清单联表 items 带出名称与规格', async () => {
    const { exec, statements } = fakeExecutor([
      {
        id: '00000000-0000-4000-8000-0000000000b1',
        shipment_id: SHIPMENT_ID,
        item_id: ITEM_ID,
        expected_qty: '5',
        actual_qty: null,
        unit_price: null,
        production_date: null,
        expiry_date: null,
        line_note: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        min_sale_unit: 'INNER',
        item_name: '苹果（改名后）',
        spec: 'BOX',
      },
    ]);
    const repos = createSqlRepos(exec);

    const rows = await repos.shipments.listItems(SHIPMENT_ID);

    const select = statements[0];
    expect(select).toContain('LEFT JOIN items');
    expect(select).toContain('i.name AS item_name');
    expect(rows[0]).toMatchObject({
      itemId: ITEM_ID,
      name: '苹果（改名后）',
      spec: 'BOX',
      minSaleUnit: 'INNER',
    });
  });
});
