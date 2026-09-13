import type { TFunction } from 'i18next';

import type { ItemDto, MinSaleUnit } from '@otunlink/shared';

// 单据明细上的 spec 存的是「最小销售单位」的文案键值：后端按物品的 min_sale_unit
// 取 inner_unit 或 spec_unit。items.specUnits 与 items.innerUnits 是同一批键值
// 但文案不同（如 BOX：箱 / 盒），因此必须结合物品的 minSaleUnit 才能选对词条分组，
// 否则会显示成原始枚举键值。

/** 物品的最小销售单位键值（与后端 shipment_items.spec 派生同一口径）。 */
export function specUnitOf(
  item: Pick<ItemDto, 'minSaleUnit' | 'innerUnit' | 'specUnit'> | null | undefined,
): string | null {
  if (!item) return null;
  return (item.minSaleUnit === 'INNER' ? item.innerUnit : item.specUnit) ?? null;
}

/** 单位文案键值 → 本地化文案；无键值显示占位符，缺分组信息（旧数据/物品信息缺失）按规格单位兜底。 */
export function unitLabel(
  t: TFunction,
  unit: string | null | undefined,
  minSaleUnit: MinSaleUnit | null | undefined,
): string {
  if (!unit) return '—';
  return t(`items.${minSaleUnit === 'INNER' ? 'innerUnits' : 'specUnits'}.${unit}`);
}
