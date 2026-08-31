// 库存台账相关的类型与常量（design.md §4.3 / §5.6）。
// 与 packages/db 的 stock_movement_type 枚举保持语义一致。

export const STOCK_MOVEMENT_TYPES = [
  'INBOUND_SHIPMENT',
  'INBOUND_MANUAL',
  'OUTBOUND_NORMAL',
  'OUTBOUND_LOSS',
  'OUTBOUND_SALE',
  'OUTBOUND_SALE_REVERSAL',
  'RETURN_IN',
  'RETURN_OUT',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** 库存行 DTO（stock JOIN batches/items/business_units）。 */
export interface StockRowDto {
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  batchId: string;
  batchNo: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  qty: string;
  avgCost: string;
  /** 可用量 = 库存数量（ck-08a 无预留/占用概念，销售单在 ck-09a 引入批次分配）。 */
  availableQty: string;
  version: number;
  updatedAt: string;
}

/** 台账流水 DTO（stock_movements，只增不改删）。 */
export interface StockMovementDto {
  id: string;
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  batchId: string;
  batchNo: string | null;
  type: StockMovementType;
  qtyDelta: string;
  qtyBefore: string;
  qtyAfter: string;
  unitCost: string | null;
  orderType: string | null;
  orderId: string | null;
  refNo: string | null;
  note: string | null;
  operatorId: string | null;
  createdAt: string;
}
