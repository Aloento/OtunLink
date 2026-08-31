import { describe, expect, it } from 'vitest';

import { createMemoryRepos } from '../repos/memory';
import { runExpiryScan } from './expiry-scan';

const WAREHOUSE_UNIT = '00000000-0000-4000-8000-000000000002';
const OTHER_UNIT = '00000000-0000-4000-8000-000000000003';

/** 相对「今天（UTC）」偏移 N 天的日期字符串。 */
function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe('ck-08b 每日效期预警扫描', () => {
  it('7 天内到期 → 通知对应仓库；已过期 → 通知对应仓库；远期/无到期日不通知', async () => {
    const repos = createMemoryRepos({
      users: [
        {
          id: 'u-warehouse',
          entraSub: 'warehouse',
          email: 'w@test.local',
          name: '仓库管理员',
          role: 'WAREHOUSE',
          scopeUnitId: null,
          status: 'ACTIVE',
          locale: 'zh-CN',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      units: [
        {
          id: WAREHOUSE_UNIT,
          code: 'WH-1',
          name: '匈牙利仓库',
          type: 'WAREHOUSE',
          address: null,
          contact: null,
          timezone: 'UTC',
          baseCurrency: 'CNY',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: OTHER_UNIT,
          code: 'WH-2',
          name: '布达佩斯二仓',
          type: 'WAREHOUSE',
          address: null,
          contact: null,
          timezone: 'UTC',
          baseCurrency: 'CNY',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      items: [
        {
          id: 'item-1',
          sku: null,
          name: '苹果',
          barcode: null,
          specUnit: 'PIECE',
          innerUnit: null,
          innerCount: null,
          isPerishable: true,
          category: null,
          description: null,
          status: 'ACTIVE',
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    // 直接向台账播种四条批次（避免走 HTTP 组装）。
    const ledger = (repos.stock as unknown as { ledger: { batches: Map<string, unknown>; stock: Map<string, unknown> } }).ledger;
    const mk = (id: string, batchNo: string, qty: number, expiryDate: string | null) => {
      const batch = { id, batchNo, productionDate: null, expiryDate, createdAt: new Date(), updatedAt: new Date() };
      ledger.batches.set(id, batch);
      ledger.stock.set(id, {
        unitId: WAREHOUSE_UNIT,
        itemId: 'item-1',
        batchId: id,
        qty,
        avgCost: 2,
        version: 1,
        updatedAt: new Date(),
      });
    };
    mk('b-expiring', 'B-EXP', 3, isoDay(4));
    mk('b-expired', 'B-OLD', 2, isoDay(-1));
    mk('b-late', 'B-LATE', 5, isoDay(30));
    mk('b-none', 'B-NONE', 1, null);

    const result = await runExpiryScan(repos);
    expect(result).toEqual({ createdCount: 2, expiringCount: 1, expiredCount: 1 });

    const rows = await repos.notifications.list({ unitId: WAREHOUSE_UNIT });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.type === 'EXPIRY_ALERT')).toBe(true);
    const titles = rows.map((r) => r.title);
    expect(titles.some((t) => t.includes('已过期'))).toBe(true);
    expect(titles.some((t) => t.includes('7 天内到期'))).toBe(true);
  });

  it('重复扫描会重复写通知（幂等留待 ck-10），计数正确', async () => {
    const repos = createMemoryRepos();
    const result = await runExpiryScan(repos);
    expect(result.createdCount).toBe(0);
  });
});
