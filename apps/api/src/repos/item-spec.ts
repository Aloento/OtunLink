// 物品规格（spec）统一派生：最小销售单位为内装时取 inner_unit，否则取 spec_unit。
// 各仓库/路由此前各自内联同一表达式，集中到此处避免口径漂移。
import type { ItemRecord } from '../types';

/** resolveSpec 的 SQL 等价表达式（要求 items 的别名为 i）。 */
export const ITEM_SPEC_SQL = `CASE WHEN i.min_sale_unit = 'INNER' THEN i.inner_unit ELSE i.spec_unit END`;

export function resolveSpec(
  item: Pick<ItemRecord, 'minSaleUnit' | 'innerUnit' | 'specUnit'> | null | undefined,
): ItemRecord['specUnit'] | null {
  if (!item) return null;
  return item.minSaleUnit === 'INNER' ? item.innerUnit : item.specUnit;
}
