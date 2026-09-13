// 组织单元仓库（units）。
import type { UnitType } from '@otunlink/shared';
import type { SqlExecutor } from '@otunlink/db';
import type { CreateUnitInput, UnitRecord, UnitRepository, UpdateUnitInput } from '../../types';
import { col, quote } from './helpers';
import { mapUnit } from './mappers';

export function createUnitsRepo(exec: SqlExecutor): UnitRepository {
  const units: UnitRepository = {
    async findById(id: string): Promise<UnitRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM business_units WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapUnit(rows[0]) : null;
    },
    async list(
      opts: { includeInactive?: boolean; scopeUnitId?: string; type?: UnitType } = {},
    ): Promise<UnitRecord[]> {
      const where: string[] = [];
      if (!opts.includeInactive) where.push('is_active = TRUE');
      if (opts.scopeUnitId) where.push(`id = ${quote(opts.scopeUnitId)}`);
      if (opts.type) where.push(`type = ${quote(opts.type)}`);
      const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const { rows } = await exec.query(`SELECT * FROM business_units${clause} ORDER BY code ASC`);
      return rows.map(mapUnit);
    },
    async create(input: CreateUnitInput): Promise<UnitRecord> {
      const { rows } = await exec.query(
        `INSERT INTO business_units (code, name, type, address, contact, is_active)
         VALUES (${quote(input.code)}, ${quote(input.name)}, ${quote(input.type)},
                 ${quote(input.address ?? null)}, ${quote(input.contact ?? null)},
                 ${quote(input.isActive ?? true)})
         RETURNING *`,
      );
      return mapUnit(rows[0]);
    },
    async update(id: string, patch: UpdateUnitInput): Promise<UnitRecord | null> {
      const sets: string[] = [];
      if (patch.code !== undefined) sets.push(col('code', patch.code));
      if (patch.name !== undefined) sets.push(col('name', patch.name));
      if (patch.type !== undefined) sets.push(col('type', patch.type));
      if (patch.address !== undefined) sets.push(col('address', patch.address));
      if (patch.contact !== undefined) sets.push(col('contact', patch.contact));
      if (patch.isActive !== undefined) sets.push(col('is_active', patch.isActive));
      if (sets.length === 0) {
        const existing = await this.findById(id);
        return existing;
      }
      sets.push('updated_at = now()');
      const { rows } = await exec.query(
        `UPDATE business_units SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
      );
      return rows[0] ? mapUnit(rows[0]) : null;
    },
    async hasReferences(id: string): Promise<boolean> {
      // SET NULL / CASCADE 外键（用户范围、签约、通知）也视为引用：保留历史与范围绑定不被静默清除。
      const checks = [
        `SELECT 1 FROM shipments WHERE shipper_unit_id = ${quote(id)} OR receiver_unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM inbound_orders WHERE warehouse_unit_id = ${quote(id)} OR counterparty_unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM outbound_orders WHERE warehouse_unit_id = ${quote(id)} OR counterparty_unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM sales_orders WHERE seller_unit_id = ${quote(id)} OR buyer_unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM return_orders WHERE from_unit_id = ${quote(id)} OR to_unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM retail_prices WHERE unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM stock WHERE unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM stock_movements WHERE unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM retail_price_history WHERE unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM retail_partnerships WHERE warehouse_unit_id = ${quote(id)} OR retailer_unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM notifications WHERE unit_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM users WHERE scope_unit_id = ${quote(id)} LIMIT 1`,
      ];
      for (const sql of checks) {
        const { rows } = await exec.query(sql);
        if (rows.length > 0) return true;
      }
      return false;
    },
    async delete(id: string): Promise<boolean> {
      const { rows } = await exec.query(
        `DELETE FROM business_units WHERE id = ${quote(id)} RETURNING id`,
      );
      return rows.length > 0;
    },
  };

  return units;
}
