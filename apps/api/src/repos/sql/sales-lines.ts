// 销售单行价快照与行级错误装配：默认零售价 + 行级改价 → 行价/行小计。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateSalesRepoInput } from '../../types';
import { SALES_LINE_INVALID } from './errors';
import { quote, roundMoney } from './helpers';

export type SalesLineIssueReason = 'NO_LIST_PRICE' | 'CURRENCY_MISMATCH' | 'NO_BATCH_STOCK' | 'QTY_EXCEEDS_STOCK';
export interface SalesLineIssue {
  index: number;
  itemId: string;
  itemName: string | null;
  reason: SalesLineIssueReason;
  message: string;
}
export function errorWithLineDetails(message: string, issues: SalesLineIssue[]): Error {
  const err = new Error(message);
  (err as { details?: unknown }).details = { lines: issues };
  return err;
}

/**
 * 按当前默认零售价（快照，保留它自己的货币）与行级改价计算行价快照。
 * 成交价恒为本单货币：默认零售价货币与本单货币不一致时必须填写行级改价（不做货币换算）。
 */
export async function computeSalesLines(
  exec: SqlExecutor,
  sellerUnitId: string,
  orderCurrency: string,
  items: CreateSalesRepoInput['items'],
  qty: (line: CreateSalesRepoInput['items'][number]) => string,
): Promise<{
  itemId: string;
  qty: string;
  listPrice: string | null;
  listPriceCurrency: string | null;
  price: string | null;
  lineTotal: string | null;
}[]> {
  const itemIds = [...new Set(items.map((l) => l.itemId))];
  const retail = new Map<string, { price: string; currency: string; itemName: string | null }>();
  for (const itemId of itemIds) {
    const { rows } = await exec.query(
      `SELECT rp.price, rp.currency, i.name AS item_name
       FROM retail_prices rp
       LEFT JOIN items i ON i.id = rp.item_id
       WHERE rp.unit_id = ${quote(sellerUnitId)} AND rp.item_id = ${quote(itemId)} LIMIT 1`,
    );
    if (rows[0]) {
      retail.set(itemId, {
        price: String(rows[0].price),
        currency: String(rows[0].currency),
        itemName: rows[0].item_name ? String(rows[0].item_name) : null,
      });
    }
  }

  const issues: SalesLineIssue[] = [];
  const lines = items.map((line, index) => {
    const qtyValue = qty(line);
    const snapshot = retail.get(line.itemId) ?? null;
    const override = line.unitPriceOverride ?? null;
    // 无行级改价时只能沿用默认零售价；货币不一致直接拒绝，避免把数字当成另一种货币使用。
    if (override === null && snapshot && snapshot.currency !== orderCurrency) {
      issues.push({
        index: index + 1,
        itemId: line.itemId,
        itemName: snapshot.itemName,
        reason: 'CURRENCY_MISMATCH',
        message: `第${index + 1}行（${snapshot.itemName ?? '未知物品'}）：默认零售价货币 ${snapshot.currency} 与本单货币 ${orderCurrency} 不一致，请填写行级改价`,
      });
    }
    const price = override ?? snapshot?.price ?? null;
    return {
      itemId: line.itemId,
      qty: qtyValue,
      listPrice: snapshot?.price ?? null,
      listPriceCurrency: snapshot?.currency ?? null,
      price,
      lineTotal: price === null ? null : roundMoney(Number(qtyValue) * Number(price)),
    };
  });
  if (issues.length > 0) throw errorWithLineDetails(SALES_LINE_INVALID, issues);
  return lines;
}

export function calcTotal(lines: { lineTotal: string | null }[], discountPercent: string, freight: string): string {
  const subtotal = lines.reduce((sum, l) => sum + Number(l.lineTotal ?? 0), 0);
  return roundMoney(subtotal * (1 - Number(discountPercent) / 100) + Number(freight));
}
