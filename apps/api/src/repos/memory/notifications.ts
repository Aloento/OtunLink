// 通知内存仓库（notifications）。
import type { NotificationListResult, NotificationRecord, NotificationRepository, NotificationVisibility } from '../../types';
import { uuid } from './helpers';

/** 内存站内通知仓储（只写； 通知中心使用）。 */
export class MemoryNotificationRepository implements NotificationRepository {
  private rows: NotificationRecord[] = [];

  async create(input: {
    userId?: string | null;
    unitId?: string | null;
    type: string;
    title: string;
    content?: string | null;
    link?: string | null;
  }): Promise<NotificationRecord> {
    const row: NotificationRecord = {
      id: uuid(),
      userId: input.userId ?? null,
      unitId: input.unitId ?? null,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      link: input.link ?? null,
      readAt: null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return { ...row };
  }

  referencesUnit(unitId: string): boolean {
    return this.rows.some((row) => row.unitId === unitId);
  }

  async list(query?: { unitId?: string; userId?: string }): Promise<NotificationRecord[]> {
    return this.rows
      .filter((row) => (query?.unitId ? row.unitId === query.unitId : true))
      .filter((row) => (query?.userId ? row.userId === query.userId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({ ...row }));
  }

  /** 可见范围：本人或所在单元（scope 为空 = 全部单元通知）。 */
  private visible(scope: NotificationVisibility): (row: NotificationRecord) => boolean {
    return (row) =>
      row.userId === scope.userId || (scope.unitId ? row.unitId === scope.unitId : row.unitId !== null);
  }

  async listForUser(
    scope: NotificationVisibility,
    query?: { page?: number; size?: number; unreadOnly?: boolean },
  ): Promise<NotificationListResult> {
    const size = Math.min(Math.max(query?.size ?? 20, 1), 50);
    const page = Math.max(query?.page ?? 1, 1);
    const filtered = this.rows
      .filter(this.visible(scope))
      .filter((row) => (query?.unreadOnly ? row.readAt === null : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (page - 1) * size;
    return {
      items: filtered.slice(start, start + size).map((row) => ({ ...row })),
      total: filtered.length,
      page,
      size,
    };
  }

  async countUnread(scope: NotificationVisibility): Promise<number> {
    return this.rows.filter(this.visible(scope)).filter((row) => row.readAt === null).length;
  }

  async markRead(scope: NotificationVisibility, ids: string[]): Promise<number> {
    const idSet = new Set(ids);
    let updated = 0;
    for (const row of this.rows) {
      if (!idSet.has(row.id)) continue;
      if (!this.visible(scope)(row)) continue;
      if (row.readAt === null) {
        row.readAt = new Date();
        updated += 1;
      }
    }
    return updated;
  }
}
