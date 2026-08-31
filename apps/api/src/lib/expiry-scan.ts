import type { Repos } from '../types';

// 每日效期预警扫描（ck-08b 附录 B / §4.2）：
// 1) 未来 7 天内到期（remainingDays ∈ [0, 7]）→ 通知对应仓库；
// 2) 已过期（remainingDays < 0）→ 通知对应仓库（提示生成报损单）。
// 通知只写 notifications 表，发送端由 ck-10 通知中心负责。
const EXPIRING_WINDOW_DAYS = 7;

export interface ExpiryAlert {
  unitId: string;
  unitName: string | null;
  /** EXPIRING / EXPIRED。 */
  kind: 'EXPIRING' | 'EXPIRED';
  title: string;
  content: string;
}

export interface ExpiryScanResult {
  /** 本次扫描写入的通知数（不含重复去重：按 单元×类型×日期 幂等可后续优化）。 */
  createdCount: number;
  /** 7 天内到期的批次行数。 */
  expiringCount: number;
  /** 已过期的批次行数。 */
  expiredCount: number;
  /** 本次扫描的预警摘要（供 §8.8 邮件叠加发送）。 */
  alerts: ExpiryAlert[];
}

export async function runExpiryScan(repos: Repos, now: Date = new Date()): Promise<ExpiryScanResult> {
  const batches = await repos.stock.listBatches({});
  const expiring = batches.filter((b) => b.remainingDays !== null && b.remainingDays >= 0 && b.remainingDays <= EXPIRING_WINDOW_DAYS);
  const expired = batches.filter((b) => b.isExpired);

  // 按仓库聚合，避免同一仓库重复刷屏（每个仓库每类一条汇总通知）。
  const byUnit = new Map<string, { unitName: string | null; expiring: typeof expiring; expired: typeof expired }>();
  for (const batch of batches) {
    const group = byUnit.get(batch.unitId) ?? { unitName: batch.unitName, expiring: [], expired: [] };
    if (expiring.some((e) => e.batchId === batch.batchId)) group.expiring.push(batch);
    if (expired.some((e) => e.batchId === batch.batchId)) group.expired.push(batch);
    byUnit.set(batch.unitId, group);
  }

  let createdCount = 0;
  const alerts: ExpiryAlert[] = [];
  for (const [unitId, group] of byUnit) {
    if (group.expiring.length > 0) {
      const title = `效期预警：${group.expiring.length} 个批次将在 7 天内到期`;
      const content = summarize(group.expiring);
      await repos.notifications.create({
        unitId,
        type: 'EXPIRY_ALERT',
        title,
        content,
        link: `/inventory?tab=expiring`,
      });
      createdCount += 1;
      alerts.push({ unitId, unitName: group.unitName, kind: 'EXPIRING', title, content });
    }
    if (group.expired.length > 0) {
      const title = `效期预警：${group.expired.length} 个批次已过期`;
      const content = summarize(group.expired);
      await repos.notifications.create({
        unitId,
        type: 'EXPIRY_ALERT',
        title,
        content,
        link: `/inventory?tab=expired`,
      });
      createdCount += 1;
      alerts.push({ unitId, unitName: group.unitName, kind: 'EXPIRED', title, content });
    }
  }

  return { createdCount, expiringCount: expiring.length, expiredCount: expired.length, alerts };
}

function summarize(batches: { itemName: string | null; batchNo: string | null; qty: string; expiryDate: string | null; remainingDays: number | null }[]): string {
  const lines = batches
    .slice(0, 10)
    .map((b) => `${b.itemName ?? '未知物品'}（批次 ${b.batchNo ?? '-'}，余量 ${b.qty}，到期 ${b.expiryDate ?? '-'}，剩 ${b.remainingDays ?? '-'} 天）`)
    .join('；');
  return lines;
}
