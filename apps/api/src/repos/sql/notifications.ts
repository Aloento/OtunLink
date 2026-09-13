// 站内通知仓库（notifications）。
import type { SqlExecutor } from '@otunlink/db';
import type { NotificationListResult, NotificationRecord, NotificationRepository, NotificationVisibility } from '../../types';
import { quote } from './helpers';
import { mapNotification } from './mappers';

export function createNotificationsRepo(exec: SqlExecutor): NotificationRepository & { scopeWhere(scope: NotificationVisibility): Promise<string> } {
  const notifications: NotificationRepository & { scopeWhere(scope: NotificationVisibility): Promise<string> } = {
    async create(input: {
      userId?: string | null;
      unitId?: string | null;
      type: string;
      title: string;
      content?: string | null;
      link?: string | null;
    }): Promise<NotificationRecord> {
      const { rows } = await exec.query(
        `INSERT INTO notifications (user_id, unit_id, type, title, content, link)
         VALUES (${quote(input.userId ?? null)}, ${quote(input.unitId ?? null)},
                 ${quote(input.type)}, ${quote(input.title)},
                 ${quote(input.content ?? null)}, ${quote(input.link ?? null)})
         RETURNING *`,
      );
      return mapNotification(rows[0]);
    },
    async list(query?: { unitId?: string; userId?: string }): Promise<NotificationRecord[]> {
      const parts: string[] = [];
      if (query?.unitId) parts.push(`unit_id = ${quote(query.unitId)}`);
      if (query?.userId) parts.push(`user_id = ${quote(query.userId)}`);
      const where = parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      const { rows } = await exec.query(
        `SELECT * FROM notifications${where} ORDER BY created_at DESC, id DESC`,
      );
      return rows.map(mapNotification);
    },
    /** 可见范围：user_id = 本人 或 unit_id = 所在单元（scope 为空时 = 全部单元通知）。 */
    async scopeWhere(scope: NotificationVisibility): Promise<string> {
      if (scope.unitId) {
        return `(user_id = ${quote(scope.userId)} OR unit_id = ${quote(scope.unitId)})`;
      }
      return `(user_id = ${quote(scope.userId)} OR unit_id IS NOT NULL)`;
    },
    async listForUser(
      scope: NotificationVisibility,
      query?: { page?: number; size?: number; unreadOnly?: boolean },
    ): Promise<NotificationListResult> {
      const page = query?.page ?? 1;
      const size = query?.size ?? 20;
      const offset = (page - 1) * size;
      const where = await notifications.scopeWhere(scope);
      const unread = query?.unreadOnly ? ' AND read_at IS NULL' : '';
      const { rows } = await exec.query(
        `SELECT *, COUNT(*) OVER() AS total_count
         FROM notifications
         WHERE ${where}${unread}
         ORDER BY created_at DESC, id DESC
         LIMIT ${quote(size)} OFFSET ${quote(offset)}`,
      );
      const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
      return { items: rows.map(mapNotification), total, page, size };
    },
    async countUnread(scope: NotificationVisibility): Promise<number> {
      const where = await notifications.scopeWhere(scope);
      const { rows } = await exec.query(
        `SELECT COUNT(*) AS n FROM notifications WHERE ${where} AND read_at IS NULL`,
      );
      return Number(rows[0]?.n ?? 0);
    },
    async markRead(scope: NotificationVisibility, ids: string[]): Promise<number> {
      if (ids.length === 0) return 0;
      const where = await notifications.scopeWhere(scope);
      const idList = ids.map((id) => quote(id)).join(', ');
      const { rows } = await exec.query(
        `UPDATE notifications SET read_at = now()
         WHERE id IN (${idList}) AND ${where}
         RETURNING id`,
      );
      return rows.length;
    },
  };

  return notifications;
}
