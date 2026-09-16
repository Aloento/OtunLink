import type { SqlExecutor } from '@otunlink/db';
import { describe, expect, it } from 'vitest';

import type { PatchSalesInput } from '../types';
import { createSqlRepos } from './sql';

const SALES_ORDER = '00000000-0000-4000-8000-0000000000e1';
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

function salesOrderRow() {
  return {
    id: SALES_ORDER,
    sales_no: 'SO-20250101-0001',
    seller_unit_id: WAREHOUSE_UNIT,
    buyer_unit_id: RETAIL_UNIT,
    source: 'RETAILER_REQUEST',
    delivery_method: 'PICKUP',
    delivery_address: null,
    carrier: null,
    tracking_no: null,
    freight: '0',
    discount_percent: '0',
    currency: 'CNY',
    total_amount: '100',
    status: 'DRAFT',
    remark: null,
    created_by: 'user-1',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };
}

async function updateStatement(input: PatchSalesInput) {
  const { exec, statements } = fakeExecutor([salesOrderRow()]);
  const repos = createSqlRepos(exec);

  const updated = await repos.sales.update(SALES_ORDER, input);
  expect(updated).not.toBeNull();
  const statement = statements.find((s) => s.includes('UPDATE sales_orders SET'));
  expect(statement).toBeDefined();
  return statement!;
}

// 来源（门店请货 / 仓库主动送货）是草稿阶段可改正的字段：提交 source 时按新值写入，
// 未提交时必须保留原值（COALESCE 兜底），避免「编辑一次就被改回默认来源」。
describe('SQL 通道：销售单草稿更新来源', () => {
  it('提交 source 时写入新值', async () => {
    const statement = await updateStatement({ source: 'WAREHOUSE_INITIATED' });
    expect(statement).toContain("source = COALESCE('WAREHOUSE_INITIATED', source)");
  });

  it('未提交 source 时保留原值', async () => {
    const statement = await updateStatement({ remark: '备注' });
    expect(statement).toContain('source = COALESCE(NULL, source)');
  });
});
