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

/**
 * 剩余天数（UTC 当日为基准，design.md §11.7 时间统一按 UTC 存储）：
 * 正数 = 距到期天数，0 = 今日到期，负数 = 已过期，null = 无到期日/格式不识别。
 */
export function expiryRemainingDays(
  expiryDate: string | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!expiryDate) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiryDate);
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((utc - todayUtc) / 86_400_000);
}

/** 库存批次视图（GET /stock/batches、/stock/expired）：在库存行上附带效期计算字段。 */
export interface StockBatchDto extends StockRowDto {
  /** 剩余天数（按 UTC 当日）；null = 无到期日。 */
  remainingDays: number | null;
  /** 已过期（remainingDays < 0）。 */
  isExpired: boolean;
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
