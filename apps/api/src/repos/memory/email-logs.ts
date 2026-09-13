// 邮件日志内存仓库（email_logs）。
import type { EmailLogRecord, EmailLogRepository } from '../../types';
import { uuid } from './helpers';

/** 内存邮件日志仓储。 */
export class MemoryEmailLogRepository implements EmailLogRepository {
  private rows = new Map<string, EmailLogRecord>();

  async create(input: {
    toAddress: string;
    subject?: string | null;
    body?: string | null;
    provider?: string | null;
  }): Promise<EmailLogRecord> {
    const row: EmailLogRecord = {
      id: uuid(),
      toAddress: input.toAddress,
      subject: input.subject ?? null,
      body: input.body ?? null,
      status: 'PENDING',
      provider: input.provider ?? null,
      error: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async markResult(
    id: string,
    input: { status: 'SENT' | 'FAILED'; error?: string | null; sentAt?: Date | null; attempts?: number },
  ): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.status = input.status;
    row.error = input.error ?? null;
    if (input.sentAt) row.sentAt = input.sentAt;
    if (input.attempts !== undefined) row.attempts = input.attempts;
  }
}
