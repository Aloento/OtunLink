// 库存仓库（stock + stock_movements）。
import type { SqlExecutor } from '@otunlink/db';
import type { StockBatchListQuery, StockBatchRecord, StockListQuery, StockListResult, StockMovementListQuery, StockMovementListResult, StockRepository } from '../../types';
import { inClause, quote } from './helpers';
import { attachExpiry, mapStockMovement, mapStockRow } from './mappers';

export function createStockRepo(exec: SqlExecutor): StockRepository {
  const stock: StockRepository = {
    async list(query: StockListQuery): Promise<StockListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [`${alias}qty > 0`];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        else if (query.unitIds) parts.push(inClause(`${alias}unit_id`, query.unitIds));
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        if (query.batchId) parts.push(`${alias}batch_id = ${quote(query.batchId)}`);
        return ` WHERE ${parts.join(' AND ')}`;
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM stock${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT s.*, bu.name AS unit_name, i.name AS item_name,
                CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END AS spec,
                i.min_sale_unit AS min_sale_unit,
                b.batch_no, b.production_date, b.expiry_date
         FROM stock s
         JOIN business_units bu ON bu.id = s.unit_id
         JOIN items i ON i.id = s.item_id
         JOIN batches b ON b.id = s.batch_id
         ${where('s.')}
         ORDER BY bu.name ASC, i.name ASC, b.expiry_date ASC NULLS LAST, s.batch_id ASC
         LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapStockRow), total, page, size };
    },
    async listMovements(
      query: StockMovementListQuery,
    ): Promise<StockMovementListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        else if (query.unitIds) parts.push(inClause(`${alias}unit_id`, query.unitIds));
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        if (query.batchId) parts.push(`${alias}batch_id = ${quote(query.batchId)}`);
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM stock_movements${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT m.*, bu.name AS unit_name, i.name AS item_name,
                CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END AS spec,
                b.batch_no
         FROM stock_movements m
         LEFT JOIN business_units bu ON bu.id = m.unit_id
         LEFT JOIN items i ON i.id = m.item_id
         LEFT JOIN batches b ON b.id = m.batch_id
         ${where('m.')}
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapStockMovement), total, page, size };
    },
    async listBatches(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
      const where = (alias: string): string => {
        const parts: string[] = [`${alias}qty > 0`];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        else if (query.unitIds) parts.push(inClause(`${alias}unit_id`, query.unitIds));
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        return ` WHERE ${parts.join(' AND ')}`;
      };
      const { rows } = await exec.query(
        `SELECT s.*, bu.name AS unit_name, i.name AS item_name,
                CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END AS spec,
                i.min_sale_unit AS min_sale_unit,
                b.batch_no, b.production_date, b.expiry_date
         FROM stock s
         JOIN business_units bu ON bu.id = s.unit_id
         JOIN items i ON i.id = s.item_id
         JOIN batches b ON b.id = s.batch_id
         ${where('s.')}
         ORDER BY bu.name ASC, i.name ASC, b.expiry_date ASC NULLS LAST, s.batch_id ASC`,
      );
      return rows.map(mapStockRow).map(attachExpiry);
    },
    async listExpired(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
      const where = (alias: string): string => {
        const parts: string[] = [
          `${alias}qty > 0`,
          `b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE`,
        ];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        else if (query.unitIds) parts.push(inClause(`${alias}unit_id`, query.unitIds));
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        return ` WHERE ${parts.join(' AND ')}`;
      };
      const { rows } = await exec.query(
        `SELECT s.*, bu.name AS unit_name, i.name AS item_name,
                CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END AS spec,
                i.min_sale_unit AS min_sale_unit,
                b.batch_no, b.production_date, b.expiry_date
         FROM stock s
         JOIN business_units bu ON bu.id = s.unit_id
         JOIN items i ON i.id = s.item_id
         JOIN batches b ON b.id = s.batch_id
         ${where('s.')}
         ORDER BY b.expiry_date ASC NULLS LAST, bu.name ASC, i.name ASC`,
      );
      return rows.map(mapStockRow).map(attachExpiry);
    },
  };

  return stock;
}
