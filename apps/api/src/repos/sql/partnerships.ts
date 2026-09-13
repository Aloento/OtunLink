// 仓库-零售签约仓库（retail_partnerships）。
import type { SqlExecutor } from '@otunlink/db';
import type { CreatePartnershipInput, CreatePartnershipResult, PartnershipListQuery, PartnershipRecord, PartnershipRepository } from '../../types';
import { quote } from './helpers';
import { mapPartnership } from './mappers';

export function createPartnershipsRepo(exec: SqlExecutor): PartnershipRepository {
  const partnerships: PartnershipRepository = {
    async list(query: PartnershipListQuery = {}): Promise<PartnershipRecord[]> {
      const parts: string[] = [];
      if (query.warehouseUnitId) parts.push(`p.warehouse_unit_id = ${quote(query.warehouseUnitId)}`);
      if (query.retailerUnitId) parts.push(`p.retailer_unit_id = ${quote(query.retailerUnitId)}`);
      const where = parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      const { rows } = await exec.query(
        `SELECT p.*, wh.name AS warehouse_unit_name, rt.name AS retailer_unit_name
         FROM retail_partnerships p
         JOIN business_units wh ON wh.id = p.warehouse_unit_id
         JOIN business_units rt ON rt.id = p.retailer_unit_id
         ${where}
         ORDER BY p.created_at DESC, p.id ASC`,
      );
      return rows.map(mapPartnership);
    },
    async listWarehouseIds(retailerUnitId: string): Promise<string[]> {
      const { rows } = await exec.query(
        `SELECT warehouse_unit_id FROM retail_partnerships
         WHERE retailer_unit_id = ${quote(retailerUnitId)}`,
      );
      return rows.map((row) => String(row.warehouse_unit_id));
    },
    async findById(id: string): Promise<PartnershipRecord | null> {
      const { rows } = await exec.query(
        `SELECT p.*, wh.name AS warehouse_unit_name, rt.name AS retailer_unit_name
         FROM retail_partnerships p
         JOIN business_units wh ON wh.id = p.warehouse_unit_id
         JOIN business_units rt ON rt.id = p.retailer_unit_id
         WHERE p.id = ${quote(id)}`,
      );
      return rows[0] ? mapPartnership(rows[0]) : null;
    },
    async create(input: CreatePartnershipInput): Promise<CreatePartnershipResult> {
      // 必须由「单条写语句」返回结果：Hyperdrive 会缓存只读查询（写操作不会使其失效），
      // 若 INSERT 后再 SELECT 同一对 (warehouse, retailer)，极可能命中 INSERT 前的陈旧缓存，
      // 从而出现「报错但刷新后发现已添加成功」。这里用 ON CONFLICT DO UPDATE 让冲突行也被
      // RETURNING 返回（xmax = 0 判定本次是插入还是命中已有行），全程不回读。
      const { rows } = await exec.query(
        `INSERT INTO retail_partnerships (warehouse_unit_id, retailer_unit_id, created_by)
         VALUES (${quote(input.warehouseUnitId)}, ${quote(input.retailerUnitId)}, ${quote(input.createdBy)})
         ON CONFLICT (warehouse_unit_id, retailer_unit_id)
         DO UPDATE SET created_by = retail_partnerships.created_by
         RETURNING *, (xmax = 0) AS inserted,
           (SELECT name FROM business_units WHERE id = retail_partnerships.warehouse_unit_id)
             AS warehouse_unit_name,
           (SELECT name FROM business_units WHERE id = retail_partnerships.retailer_unit_id)
             AS retailer_unit_name`,
      );
      const row = rows[0];
      if (!row) throw new Error('PARTNERSHIP_CREATE_FAILED: partnership upsert returned no row');
      return {
        record: mapPartnership(row),
        created: row.inserted === true || row.inserted === 'true' || row.inserted === 't',
      };
    },
    async delete(id: string): Promise<boolean> {
      const { rows } = await exec.query(
        `DELETE FROM retail_partnerships WHERE id = ${quote(id)} RETURNING id`,
      );
      return rows.length > 0;
    },
  };

  return partnerships;
}
