import type { ShipmentItemRecord } from '../types';

export interface MergedInboundLine {
  itemId: string;
  qty: string;
  unitCost: string;
  productionDate: string | null;
  expiryDate: string | null;
  batchNo: string | null;
}

type Group = {
  itemId: string;
  productionDate: string | null;
  expiryDate: string | null;
  qty: number;
  totalCost: number;
  batchNo: string | null;
};

/**
 * 按 (itemId, productionDate, expiryDate) 归并入库行（确认收货 / 部分退货剩余入库）。
 * - qtyOf 返回该发货行应入库的数量（0/空跳过）；
 * - unit_cost 取发货价加权平均（同组多行价格不同时保成本口径），保留两位；
 * - batchNoOf 返回用户录入批号；缺省自动 `${autoBatchPrefix}-B{n}`（n 为归并后行序）。
 */
export function mergeInboundLines(
  shipmentItems: ShipmentItemRecord[],
  qtyOf: (item: ShipmentItemRecord) => string | null,
  batchNoOf: (item: ShipmentItemRecord) => string | null,
  autoBatchPrefix: string,
): MergedInboundLine[] {
  const groups = new Map<string, Group>();
  const order: string[] = [];
  for (const item of shipmentItems) {
    if (!item.itemId) continue;
    const qty = Number(qtyOf(item) ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const key = `${item.itemId}|${item.productionDate ?? ''}|${item.expiryDate ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        itemId: item.itemId,
        productionDate: item.productionDate,
        expiryDate: item.expiryDate,
        qty: 0,
        totalCost: 0,
        batchNo: null,
      };
      groups.set(key, group);
      order.push(key);
    }
    group.qty += qty;
    group.totalCost += qty * Number(item.unitPrice ?? 0);
    const provided = batchNoOf(item);
    if (provided && group.batchNo === null) group.batchNo = provided;
  }
  return order.map((key, index) => {
    const group = groups.get(key)!;
    const unitCost = group.qty > 0 ? (group.totalCost / group.qty).toFixed(2) : '0';
    return {
      itemId: group.itemId,
      qty: group.qty.toFixed(2),
      unitCost,
      productionDate: group.productionDate,
      expiryDate: group.expiryDate,
      batchNo: group.batchNo ?? `${autoBatchPrefix}-B${index + 1}`,
    };
  });
}

/** 数量相等判断（null/undefined 按 0）。 */
export function qtyEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return Number(a ?? 0) === Number(b ?? 0);
}
