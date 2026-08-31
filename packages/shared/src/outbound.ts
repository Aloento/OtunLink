// 出库单相关的类型与常量（design.md §4.3 / §5.4）。
// 与 packages/db 的 outbound_type / outbound_status 枚举保持语义一致。

export const OUTBOUND_TYPES = ['NORMAL', 'LOSS'] as const;
export type OutboundType = (typeof OUTBOUND_TYPES)[number];

export const OUTBOUND_STATUSES = ['DRAFT', 'POSTED'] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

/** 出库单明细 DTO（outbound_order_items；POST 后 batch_id 回填分配结果）。 */
export interface OutboundOrderItemDto {
  id: string;
  outboundOrderId: string;
  itemId: string;
  batchId: string | null;
  qty: string;
  /** 扣减时快照的批次加权平均成本（POST 后不可变）。 */
  unitCost: string | null;
  createdAt: string;
  /** 联表带出（展示用）。 */
  itemName?: string | null;
  spec?: string | null;
  batchNo?: string | null;
}

/** 出库单 DTO（outbound_orders）。 */
export interface OutboundOrderDto {
  id: string;
  outboundNo: string;
  type: OutboundType;
  warehouseUnitId: string;
  counterpartyUnitId: string | null;
  status: OutboundStatus;
  lossReason: string | null;
  photoFileIds: string[];
  remark: string | null;
  postedBy: string | null;
  postedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** 联表带出（展示用）。 */
  warehouseName?: string | null;
  counterpartyName?: string | null;
}

/** 出库单详情 DTO（在列表 DTO 基础上附带明细）。 */
export interface OutboundOrderDetailDto extends OutboundOrderDto {
  items: OutboundOrderItemDto[];
}
