// 零售价相关的类型与常量（design.md §4.2 retail_prices）。
// 铁律：零售价由仓库/管理员随时修改（写 retail_price_history 留痕）；
// 入库原价 unit_cost 任何接口/页面均不可修改，仅只读展示。

/** 零售价行 DTO（retail_prices JOIN units/items + 只读参考 unit_cost）。 */
export interface RetailPriceDto {
  id: string;
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  /** 当前零售价（numeric 转字符串，货币单位见 currency）。 */
  price: string;
  currency: string;
  /** 入库加权平均进价（只读参考；无库存为 null）。 */
  unitCost: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

/** 零售价历史行 DTO（retail_price_history）。 */
export interface RetailPriceHistoryDto {
  id: string;
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  price: string;
  currency: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
}
