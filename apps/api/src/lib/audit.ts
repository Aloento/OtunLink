import type { Repos } from '../types';

// 审计日志（ck-10 §6.2）：关键写操作入闸记录 actor/entity/before/after 摘要。
// 审计失败只 console.error（审计表 500 不应阻断业务），但业务路由应尽量先写后返回。

export interface AuditInput {
  userId?: string | null;
  /** 如 INBOUND_POST / OUTBOUND_POST / SALES_SEND / RETAIL_PRICE_UPDATE 等（snake_case）。 */
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function recordAudit(repos: Repos, input: AuditInput): Promise<void> {
  try {
    await repos.auditLogs.create({
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      before: input.before,
      after: input.after,
      ip: input.ip ?? null,
    });
  } catch (err) {
    console.error('[audit] 审计日志写入失败', input.action, err);
  }
}
