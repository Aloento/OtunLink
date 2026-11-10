// 销售单行价快照与行级错误装配：默认零售价 + 行级改价 → 行价/行小计。
import type { SqlExecutor } from '@otunlink/db';
import type { CreateSalesRepoInput } from '../../types';
import { SALES_LINE_INVALID } from './errors';
import { quote, round2num, roundMoney } from './helpers';

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
  bundleItemId: string | null;
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
      bundleItemId: null as string | null,
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


/**
 * 组合商品展开：把「组合商品」行替换成组件行，保留组合商品金额总额与归组关系。
 * 组件行价格按组件数量占比分摊整行金额（尾差落在最后一个组件），
 * 出库/批次分配/拣货都作用在真实组件上，销售行仍能按 bundleItemId 折叠回组合商品。
 */
export async function expandBundleLines<
  T extends {
    itemId: string;
    qty: string;
    listPrice: string | null;
    listPriceCurrency: string | null;
    price: string | null;
    lineTotal: string | null;
    bundleItemId?: string | null;
  },
>(exec: SqlExecutor, lines: T[]): Promise<T[]> {
  const ids = [...new Set(lines.map((l) => l.itemId))];
  if (ids.length === 0) return lines;
  const { rows } = await exec.query(
    `SELECT bundle_item_id, component_item_id, qty
       FROM bundle_components
      WHERE bundle_item_id IN (${ids.map((id) => quote(id)).join(', ')})
      ORDER BY sort_order ASC, created_at ASC`,
  );
  if (rows.length === 0) return lines;

  const byBundle = new Map<string, { componentItemId: string; qty: number }[]>();
  for (const row of rows) {
    const bundleId = String(row.bundle_item_id);
    const list = byBundle.get(bundleId) ?? [];
    list.push({ componentItemId: String(row.component_item_id), qty: Number(row.qty) });
    byBundle.set(bundleId, list);
  }

  const out: T[] = [];
  for (const line of lines) {
    const components = byBundle.get(line.itemId);
    if (!components || components.length === 0) {
      out.push(line);
      continue;
    }
    const bundleQty = Number(line.qty);
    const bundleTotal = line.price === null ? null : Number(line.price) * bundleQty;
    const weightSum = components.reduce((sum, c) => sum + c.qty, 0) || 1;
    let allocated = 0;
    components.forEach((component, index) => {
      const compQty = round2num(bundleQty * component.qty);
      const isLast = index === components.length - 1;
      const share =
        bundleTotal === null
          ? null
          : isLast
            ? round2num(bundleTotal - allocated)
            : round2num((bundleTotal * component.qty) / weightSum);
      if (share !== null) allocated = round2num(allocated + share);
      out.push({
        ...line,
        itemId: component.componentItemId,
        qty: String(compQty),
        price: share === null || compQty === 0 ? null : roundMoney(share / compQty),
        lineTotal: share === null ? null : roundMoney(share),
        bundleItemId: line.itemId,
      });
    });
  }
  return out;
}
