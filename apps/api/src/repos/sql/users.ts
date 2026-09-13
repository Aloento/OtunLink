// 用户仓库（users）。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateUserInput, UpdateUserInput, UserRecord, UserRepository } from '../../types';
import { assertNotLockedAdmin, isPermanentAdminEmail } from '../../lib/admins';
import { col, quote } from './helpers';
import { mapUser } from './mappers';

export function createUsersRepo(exec: SqlExecutor): UserRepository {
  const users: UserRepository = {
    async findByEntraSub(sub: string): Promise<UserRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM users WHERE entra_sub = ${quote(sub)} LIMIT 1`);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async findById(id: string): Promise<UserRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM users WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async list(): Promise<UserRecord[]> {
      const { rows } = await exec.query('SELECT * FROM users ORDER BY created_at ASC');
      return rows.map(mapUser);
    },
    async create(input: CreateUserInput): Promise<UserRecord> {
      const { rows } = await exec.query(
        `INSERT INTO users (entra_sub, email, name, role, scope_unit_id, status, locale)
         VALUES (${quote(input.entraSub)}, ${quote(input.email)}, ${quote(input.name)},
                 ${quote(input.role ?? null)}, ${quote(input.scopeUnitId ?? null)},
                 ${quote(input.status ?? 'PENDING')}, ${quote(input.locale ?? 'zh-CN')})
         RETURNING *`,
      );
      return mapUser(rows[0]);
    },
    async update(id: string, patch: UpdateUserInput): Promise<UserRecord | null> {
      const existing = await this.findById(id);
      if (existing && isPermanentAdminEmail(existing.email)) {
        assertNotLockedAdmin(existing);
      }
      const sets: string[] = [];
      if (patch.name !== undefined) sets.push(col('name', patch.name));
      if (patch.role !== undefined) sets.push(col('role', patch.role));
      if (patch.scopeUnitId !== undefined) sets.push(col('scope_unit_id', patch.scopeUnitId));
      if (patch.status !== undefined) sets.push(col('status', patch.status));
      if (patch.locale !== undefined) sets.push(col('locale', patch.locale));
      if (sets.length === 0) {
        return existing;
      }
      sets.push('updated_at = now()');
      const { rows } = await exec.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
      );
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async delete(id: string): Promise<boolean> {
      const existing = await this.findById(id);
      if (existing && isPermanentAdminEmail(existing.email)) {
        assertNotLockedAdmin(existing);
      }
      const { rows } = await exec.query(`DELETE FROM users WHERE id = ${quote(id)} RETURNING id`);
      return (rows.length ?? 0) > 0;
    },
  };

  return users;
}
