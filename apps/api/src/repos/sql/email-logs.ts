// 邮件日志仓库（email_logs）。
import type { SqlExecutor } from '@otunlink/db';
import type { EmailLogRecord, EmailLogRepository } from '../../types';
import { quote } from './helpers';
import { mapEmailLog } from './mappers';

export function createEmailLogsRepo(exec: SqlExecutor): EmailLogRepository {
  const emailLogs: EmailLogRepository = {
    async create(input: {
      toAddress: string;
      subject?: string | null;
      body?: string | null;
      provider?: string | null;
    }): Promise<EmailLogRecord> {
      const { rows } = await exec.query(
        `INSERT INTO email_logs (to_address, subject, body, provider)
         VALUES (${quote(input.toAddress)}, ${quote(input.subject ?? null)},
                 ${quote(input.body ?? null)}, ${quote(input.provider ?? null)})
         RETURNING *`,
      );
      return mapEmailLog(rows[0]);
    },
    async markResult(
      id: string,
      input: { status: 'SENT' | 'FAILED'; error?: string | null; sentAt?: Date | null; attempts?: number },
    ): Promise<void> {
      const sets = [`status = ${quote(input.status)}`];
      sets.push(`error = ${quote(input.error ?? null)}`);
      if (input.sentAt) sets.push(`sent_at = ${quote(input.sentAt)}`);
      if (input.attempts !== undefined) sets.push(`attempts = ${quote(input.attempts)}`);
      await exec.query(
        `UPDATE email_logs SET ${sets.join(', ')} WHERE id = ${quote(id)}`,
      );
    },
  };

  return emailLogs;
}
