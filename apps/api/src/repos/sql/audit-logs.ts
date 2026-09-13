// 审计日志仓库（audit_logs）。
import type { SqlExecutor } from '@otunlink/db';
import type { AuditLogListQuery, AuditLogListResult, AuditLogRecord, AuditLogRepository } from '../../types';
import { jsonb, quote } from './helpers';
import { mapAuditLog } from './mappers';

export function createAuditLogsRepo(exec: SqlExecutor): AuditLogRepository {
  const auditLogs: AuditLogRepository = {
    async create(input: {
      userId?: string | null;
      action: string;
      entityType?: string | null;
      entityId?: string | null;
      before?: unknown;
      after?: unknown;
      ip?: string | null;
    }): Promise<AuditLogRecord> {
      const { rows } = await exec.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before, after, ip)
         VALUES (${quote(input.userId ?? null)}, ${quote(input.action)},
                 ${quote(input.entityType ?? null)}, ${quote(input.entityId ?? null)},
                 ${quote(jsonb(input.before))}, ${quote(jsonb(input.after))},
                 ${quote(input.ip ?? null)})
         RETURNING *`,
      );
      return mapAuditLog(rows[0]);
    },
    async list(query?: AuditLogListQuery): Promise<AuditLogListResult> {
      const page = query?.page ?? 1;
      const size = query?.size ?? 20;
      const offset = (page - 1) * size;
      const parts: string[] = [];
      if (query?.entityType) parts.push(`entity_type = ${quote(query.entityType)}`);
      if (query?.entityId) parts.push(`entity_id = ${quote(query.entityId)}`);
      if (query?.actorId) parts.push(`user_id = ${quote(query.actorId)}`);
      if (query?.from) parts.push(`created_at >= ${quote(new Date(query.from))}`);
      if (query?.to) parts.push(`created_at <= ${quote(new Date(`${query.to}T23:59:59.999Z`))}`);
      const where = parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      const { rows } = await exec.query(
        `SELECT a.*, COUNT(*) OVER() AS total_count
         FROM audit_logs a${where}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ${quote(size)} OFFSET ${quote(offset)}`,
      );
      const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
      return { items: rows.map(mapAuditLog), total, page, size };
    },
  };

  return auditLogs;
}
