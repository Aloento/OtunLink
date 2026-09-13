// 零售价仓库（retail_prices + retail_price_history）。
import type { SqlExecutor } from '@otunlink/db';
import type { RetailPriceHistoryRecord, RetailPriceListQuery, RetailPriceRecord, RetailPriceRepository } from '../../types';
import { ITEM_SPEC_SQL } from '../item-spec';
import { inClause, quote } from './helpers';
import { mapRetailPrice, mapRetailPriceHistory } from './mappers';

export function createRetailPricesRepo(exec: SqlExecutor): RetailPriceRepository {
  const retailPrices: RetailPriceRepository = {
    async list(query: RetailPriceListQuery): Promise<RetailPriceRecord[]> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        else if (query.unitIds) parts.push(inClause(`${alias}unit_id`, query.unitIds));
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const { rows } = await exec.query(
        `SELECT rp.*, bu.name AS unit_name, i.name AS item_name,
                ${ITEM_SPEC_SQL} AS spec,
                i.min_sale_unit AS min_sale_unit,
                bu2.name AS updated_by_name,
                (SELECT CASE WHEN SUM(s.qty) > 0
                        THEN ROUND(SUM(s.qty * s.avg_cost) / SUM(s.qty), 2)
                        ELSE NULL END
                 FROM stock s
                 WHERE s.unit_id = rp.unit_id AND s.item_id = rp.item_id) AS unit_cost
         FROM retail_prices rp
         JOIN business_units bu ON bu.id = rp.unit_id
         JOIN items i ON i.id = rp.item_id
         LEFT JOIN users bu2 ON bu2.id = rp.updated_by
         ${where('rp.')}
         ORDER BY bu.name ASC, i.name ASC`,
      );
      return rows.map(mapRetailPrice);
    },
    async setPrice(input: {
      unitId: string;
      itemId: string;
      price: string;
      currency: string;
      updatedBy: string;
    }): Promise<RetailPriceRecord> {
      const now = 'now()';
      const { rows } = await exec.query(
        `INSERT INTO retail_prices (unit_id, item_id, price, currency, updated_by, updated_at)
         VALUES (${quote(input.unitId)}, ${quote(input.itemId)}, ${quote(input.price)},
                 ${quote(input.currency)}, ${quote(input.updatedBy)}, ${now})
         ON CONFLICT (unit_id, item_id)
         DO UPDATE SET price = EXCLUDED.price, currency = EXCLUDED.currency,
                       updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING *`,
      );
      await exec.query(
        `INSERT INTO retail_price_history (unit_id, item_id, price, currency, updated_by, updated_at)
         VALUES (${quote(input.unitId)}, ${quote(input.itemId)}, ${quote(input.price)},
                 ${quote(input.currency)}, ${quote(input.updatedBy)}, ${now})`,
      );
      const hydrated = await retailPrices.list({ unitId: input.unitId, itemId: input.itemId });
      return hydrated[0] ?? mapRetailPrice(rows[0]);
    },
    async listHistory(unitId: string, itemId: string): Promise<RetailPriceHistoryRecord[]> {
      const { rows } = await exec.query(
        `SELECT h.*, bu.name AS unit_name, i.name AS item_name,
                ${ITEM_SPEC_SQL} AS spec,
                u.name AS updated_by_name
         FROM retail_price_history h
         JOIN business_units bu ON bu.id = h.unit_id
         JOIN items i ON i.id = h.item_id
         LEFT JOIN users u ON u.id = h.updated_by
         WHERE h.unit_id = ${quote(unitId)} AND h.item_id = ${quote(itemId)}
         ORDER BY h.updated_at DESC, h.id DESC`,
      );
      return rows.map(mapRetailPriceHistory);
    },
  };

  return retailPrices;
}
