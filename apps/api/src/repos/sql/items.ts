// 物品仓库（items + item_images）。
import { ErrorCodes } from '@otunlink/shared';
import type { SqlExecutor } from '@otunlink/db';
import type { CreateItemInput, ItemImageRecord, ItemListQuery, ItemListResult, ItemRecord, ItemRepository, UpdateItemInput } from '../../types';
import { col, nn, quote } from './helpers';
import { mapFile, mapItem } from './mappers';

const SKU_ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSkuCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SKU_ALPHANUM[Math.floor(Math.random() * SKU_ALPHANUM.length)];
  }
  return out;
}

// 生成短 SKU：优先取名字中的 ASCII 字母数字（首个字符保证为字母，最多 8 位），
// 无 ASCII 字母时退化为 8 位随机码。目标 ≤16 字符。
function generateItemSku(name: string): string {
  const alnum = String(name ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  const firstLetter = alnum.search(/[A-Z]/);
  if (firstLetter >= 0) {
    const base = alnum.slice(firstLetter).slice(0, 8);
    return `${base}-${randomSkuCode(6)}`;
  }
  return randomSkuCode(8);
}

function ensureItemSku(raw: string | null | undefined, name: string): string {
  const candidate = raw?.trim();
  return candidate && candidate.length > 0 ? candidate : generateItemSku(name);
}

export function createItemsRepo(exec: SqlExecutor): ItemRepository {
  const items: ItemRepository = {
    async findById(id: string): Promise<ItemRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM items WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapItem(rows[0]) : null;
    },
    async findByBarcode(code: string): Promise<ItemRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM items WHERE status = 'ACTIVE' AND barcode = ${quote(code.trim())} LIMIT 1`,
      );
      return rows[0] ? mapItem(rows[0]) : null;
    },
    async list(query: ItemListQuery): Promise<ItemListResult> {
      const where: string[] = [];
      if (query.q) {
        const q = query.q.trim();
        where.push(
          `(name ILIKE ${quote(`%${q}%`)} OR barcode ILIKE ${quote(`%${q}%`)} OR sku ILIKE ${quote(`%${q}%`)})`,
        );
      }
      if (query.category) {
        const category = query.category.trim();
        if (category) where.push(`category = ${quote(category)}`);
      }
      const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const size = Math.min(Math.max(query.size ?? 50, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(`SELECT count(*)::int AS n FROM items${clause}`);
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT * FROM items${clause} ORDER BY created_at DESC, name ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapItem), total, page, size };
    },
    async listCategories(): Promise<string[]> {
      const { rows } = await exec.query(
        `SELECT btrim(category) AS category, count(*)::int AS n
           FROM items
          WHERE category IS NOT NULL AND btrim(category) <> ''
          GROUP BY btrim(category)
          ORDER BY n DESC, category ASC`,
      );
      return rows.map((row) => String(row.category));
    },
    async create(input: CreateItemInput): Promise<ItemRecord> {
      const hasManualSku = Boolean(input.sku?.trim());
      let sku = ensureItemSku(input.sku, input.name);
      if (!hasManualSku) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const dup = await exec.query(`SELECT 1 FROM items WHERE sku = ${quote(sku)} LIMIT 1`);
          if (dup.rows.length === 0) break;
          sku = generateItemSku(input.name);
        }
      }
      const { rows } = await exec.query(
        `INSERT INTO items
           (sku, name, barcode, spec_unit, inner_unit, inner_count, min_sale_unit, is_perishable,
            category, description, status, created_by)
         VALUES (${quote(sku)}, ${quote(input.name)}, ${quote(nn(input.barcode))},
                 ${quote(input.specUnit ?? 'PIECE')}, ${quote(input.innerUnit ?? null)},
                 ${quote(input.innerCount ?? null)}, ${quote(input.minSaleUnit ?? 'SPEC')},
                 ${quote(input.isPerishable ?? false)},
                 ${quote(nn(input.category))}, ${quote(nn(input.description))},
                 ${quote(input.status ?? 'ACTIVE')}, ${quote(input.createdBy)})
         RETURNING *`,
      );
      return mapItem(rows[0]);
    },
    async update(id: string, patch: UpdateItemInput): Promise<ItemRecord | null> {
      const sets: string[] = [];
      if (patch.sku !== undefined) sets.push(col('sku', patch.sku));
      if (patch.name !== undefined) sets.push(col('name', patch.name));
      if (patch.barcode !== undefined) sets.push(col('barcode', patch.barcode));
      if (patch.specUnit !== undefined) sets.push(col('spec_unit', patch.specUnit));
      if (patch.innerUnit !== undefined) sets.push(col('inner_unit', patch.innerUnit));
      if (patch.innerCount !== undefined) sets.push(col('inner_count', patch.innerCount));
      if (patch.minSaleUnit !== undefined) sets.push(col('min_sale_unit', patch.minSaleUnit));
      if (patch.isPerishable !== undefined) sets.push(col('is_perishable', patch.isPerishable));
      if (patch.category !== undefined) sets.push(col('category', patch.category));
      if (patch.description !== undefined) sets.push(col('description', patch.description));
      if (patch.status !== undefined) sets.push(col('status', patch.status));
      if (sets.length === 0) {
        const existing = await this.findById(id);
        return existing;
      }
      sets.push('updated_at = now()');
      const { rows } = await exec.query(
        `UPDATE items SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
      );
      return rows[0] ? mapItem(rows[0]) : null;
    },
    async listImages(itemId: string): Promise<ItemImageRecord[]> {
      const { rows } = await exec.query(
        `SELECT ii.*, f.* FROM item_images ii
           LEFT JOIN files f ON f.id = ii.file_id
         WHERE ii.item_id = ${quote(itemId)}
         ORDER BY ii.sort_order ASC, ii.created_at ASC`,
      );
      return rows.map((row) => ({
        id: String(row.id),
        itemId: String(row.item_id),
        fileId: String(row.file_id),
        isPrimary: row.is_primary === true || row.is_primary === 'true' || row.is_primary === 't',
        sortOrder: Number(row.sort_order),
        createdAt: new Date(String(row.created_at)),
        file: row.key ? mapFile(row) : undefined,
      }));
    },
    async attachImages(itemId: string, fileIds: string[]): Promise<ItemImageRecord[]> {
      const existing = await this.listImages(itemId);
      let order = existing.reduce((max, img) => Math.max(max, img.sortOrder), 0);
      for (const fileId of fileIds) {
        order += 1;
        const isPrimary = existing.length === 0 && order === 1;
        await exec.query(
          `INSERT INTO item_images (item_id, file_id, is_primary, sort_order)
           VALUES (${quote(itemId)}, ${quote(fileId)}, ${quote(isPrimary)}, ${quote(order)})`,
        );
      }
      return this.listImages(itemId);
    },
    async replaceImages(itemId: string, fileIds: string[]): Promise<ItemImageRecord[]> {
      await exec.query('BEGIN');
      try {
        await exec.query(`DELETE FROM item_images WHERE item_id = ${quote(itemId)}`);
        for (const [index, fileId] of fileIds.entries()) {
          await exec.query(
            `INSERT INTO item_images (item_id, file_id, is_primary, sort_order)
             VALUES (${quote(itemId)}, ${quote(fileId)}, ${quote(index === 0)}, ${quote(index + 1)})`,
          );
        }
        await exec.query('COMMIT');
        return this.listImages(itemId);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async merge(sourceId: string, targetId: string): Promise<ItemRecord | null> {
      await exec.query('BEGIN');
      try {
        const locked = await exec.query(
          `SELECT id FROM items WHERE id IN (${quote(sourceId)}, ${quote(targetId)}) FOR UPDATE`,
        );
        if (locked.rows.length !== 2) {
          await exec.query('ROLLBACK');
          return null;
        }

        // Merge batches first. A matching batch number is one logical batch; its
        // references and stock are redirected to the target batch.
        const sourceBatches = await exec.query(
          `SELECT id, batch_no FROM batches WHERE item_id = ${quote(sourceId)}`,
        );
        for (const batch of sourceBatches.rows) {
          const sourceBatchId = String(batch.id);
          const batchNo = batch.batch_no == null ? null : String(batch.batch_no);
          let targetBatchId: string | null = null;
          if (batchNo !== null) {
            const targetBatch = await exec.query(
              `SELECT id FROM batches
                 WHERE item_id = ${quote(targetId)} AND batch_no = ${quote(batchNo)}
                 LIMIT 1`,
            );
            targetBatchId = targetBatch.rows[0] ? String(targetBatch.rows[0].id) : null;
          }
          if (targetBatchId) {
            await exec.query(
              `UPDATE stock source
                  SET item_id = ${quote(targetId)}, batch_id = ${quote(targetBatchId)}
                WHERE source.item_id = ${quote(sourceId)}
                  AND source.batch_id = ${quote(sourceBatchId)}
                  AND NOT EXISTS (
                    SELECT 1 FROM stock target
                     WHERE target.unit_id = source.unit_id
                       AND target.item_id = ${quote(targetId)}
                       AND target.batch_id = ${quote(targetBatchId)}
                  )`,
            );
            await exec.query(
              `UPDATE stock target
                  SET qty = target.qty + source.qty,
                      avg_cost = CASE WHEN target.qty + source.qty = 0 THEN 0
                                      ELSE (target.avg_cost * target.qty + source.avg_cost * source.qty)
                                           / (target.qty + source.qty) END,
                      version = GREATEST(target.version, source.version) + 1,
                      updated_at = now()
                FROM stock source
               WHERE target.unit_id = source.unit_id
                 AND target.item_id = ${quote(targetId)}
                 AND target.batch_id = ${quote(targetBatchId)}
                 AND source.item_id = ${quote(sourceId)}
                 AND source.batch_id = ${quote(sourceBatchId)}`,
            );
            await exec.query(
              `DELETE FROM stock
                WHERE item_id = ${quote(sourceId)} AND batch_id = ${quote(sourceBatchId)}`,
            );
            await exec.query(
              `UPDATE sales_batch_allocations target
                  SET qty = target.qty + source.qty
                 FROM sales_batch_allocations source
                WHERE source.order_item_id = target.order_item_id
                  AND source.batch_id = ${quote(sourceBatchId)}
                  AND target.batch_id = ${quote(targetBatchId)}`,
            );
            await exec.query(
              `DELETE FROM sales_batch_allocations source
               WHERE source.batch_id = ${quote(sourceBatchId)}
                 AND EXISTS (
                   SELECT 1 FROM sales_batch_allocations target
                    WHERE target.order_item_id = source.order_item_id
                      AND target.batch_id = ${quote(targetBatchId)}
                 )`,
            );
            for (const table of [
              'inbound_order_items',
              'outbound_order_items',
              'return_order_items',
              'stock_movements',
            ]) {
              const column = table === 'return_order_items' ? 'original_batch_id' : 'batch_id';
              await exec.query(
                `UPDATE ${table} SET ${column} = ${quote(targetBatchId)}
                  WHERE ${column} = ${quote(sourceBatchId)}`,
              );
            }
            await exec.query(`DELETE FROM batches WHERE id = ${quote(sourceBatchId)}`);
          } else {
            await exec.query(
              `UPDATE batches SET item_id = ${quote(targetId)}
                WHERE id = ${quote(sourceBatchId)}`,
            );
          }
        }

        // Unique retail price rows keep the target item's price; history is retained.
        await exec.query(
          `DELETE FROM retail_prices source
            USING retail_prices target
           WHERE source.item_id = ${quote(sourceId)}
             AND target.item_id = ${quote(targetId)}
             AND source.unit_id = target.unit_id`,
        );
        for (const table of [
          'item_images',
          'shipment_items',
          'inbound_order_items',
          'outbound_order_items',
          'sales_order_items',
          'return_order_items',
          'stock',
          'stock_movements',
          'retail_prices',
          'retail_price_history',
        ]) {
          await exec.query(
            `UPDATE ${table} SET item_id = ${quote(targetId)}
              WHERE item_id = ${quote(sourceId)}`,
          );
        }
        await exec.query(`DELETE FROM items WHERE id = ${quote(sourceId)}`);
        const result = await exec.query(`SELECT * FROM items WHERE id = ${quote(targetId)}`);
        await exec.query('COMMIT');
        return result.rows[0] ? mapItem(result.rows[0]) : null;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        if (err instanceof Error && /duplicate|unique|constraint/i.test(err.message)) {
          throw new Error(ErrorCodes.ITEM_MERGE_CONFLICT);
        }
        throw err;
      }
    },
    async hasReferences(id: string): Promise<boolean> {
      // shipment_items.item_id 是 SET NULL 外键，但历史发货单仍引用该物品，也必须检查。
      const checks = [
        `SELECT 1 FROM shipment_items WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM inbound_order_items WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM outbound_order_items WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM sales_order_items WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM return_order_items WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM batches WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM stock WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM stock_movements WHERE item_id = ${quote(id)} LIMIT 1`,
        `SELECT 1 FROM retail_prices WHERE item_id = ${quote(id)} LIMIT 1`,
      ];
      for (const sql of checks) {
        const { rows } = await exec.query(sql);
        if (rows.length > 0) return true;
      }
      return false;
    },
    async delete(id: string): Promise<boolean> {
      await exec.query('BEGIN');
      try {
        await exec.query(`DELETE FROM item_images WHERE item_id = ${quote(id)}`);
        const { rows } = await exec.query(
          `DELETE FROM items WHERE id = ${quote(id)} RETURNING id`,
        );
        await exec.query('COMMIT');
        return rows.length > 0;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };

  return items;
}
