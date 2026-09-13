// 审计日志内存仓库（audit_logs）。
import type { AuditLogListQuery, AuditLogListResult, AuditLogRecord, AuditLogRepository } from '../../types';
import { uuid } from './helpers';

/** 内存审计日志仓储（审计）。 */
export class MemoryAuditLogRepository implements AuditLogRepository {
  private rows: AuditLogRecord[] = [];

  async create(input: {
    userId?: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  }): Promise<AuditLogRecord> {
    const row: AuditLogRecord = {
      id: uuid(),
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async list(query?: AuditLogListQuery): Promise<AuditLogListResult> {
    const size = Math.min(Math.max(query?.size ?? 20, 1), 50);
    const page = Math.max(query?.page ?? 1, 1);
    const filtered = this.rows
      .filter((row) => (query?.entityType ? row.entityType === query.entityType : true))
      .filter((row) => (query?.entityId ? row.entityId === query.entityId : true))
      .filter((row) => (query?.actorId ? row.userId === query.actorId : true))
      .filter((row) => (query?.from ? row.createdAt >= new Date(query.from) : true))
      .filter((row) => (query?.to ? row.createdAt <= new Date(`${query.to}T23:59:59.999Z`) : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (page - 1) * size;
    return {
      items: filtered.slice(start, start + size).map((row) => ({ ...row })),
      total: filtered.length,
      page,
      size,
    };
  }
}
