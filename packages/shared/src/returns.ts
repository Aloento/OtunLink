// 退货单相关的类型与常量。
// 与 packages/db 的 return_status / return_source_type 枚举保持语义一致。

export const RETURN_STATUSES = [
  'PENDING',
  'CLOSED',
  'REJECTED',
  'REQUESTED',
  'APPROVED',
  'RETURNED',
  'CANCELLED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_SOURCE_TYPES = ['SHIPMENT', 'SALES'] as const;
export type ReturnSourceType = (typeof RETURN_SOURCE_TYPES)[number];

/** 退货单明细 DTO（return_order_items）。 */
export interface ReturnOrderItemDto {
  id: string;
  returnOrderId: string;
  itemId: string;
  /** SHIPMENT 来源退货关联到被拒收的发货清单行。 */
  shipmentItemId: string | null;
  /** SALES 来源退货关联到销售单行。 */
  salesOrderItemId: string | null;
  qty: string;
  /** 实收退货数量（SALES 来源退回收货后写入；null = 未收货）。 */
  receivedQty: string | null;
  originalBatchId: string | null;
  reason: string | null;
  createdAt: string;
  /** 联表带出（展示用）。 */
  itemName?: string | null;
  /** 回补批次是否为「退货待检批次」（RETURNS_PENDING，需质检后放行）。 */
  pendingQc?: boolean;
}

/** 退货单 DTO（return_orders）。 */
export interface ReturnOrderDto {
  id: string;
  returnNo: string;
  sourceType: ReturnSourceType;
  shipmentId: string | null;
  /** SALES 来源退货关联到销售单。 */
  salesOrderId: string | null;
  fromUnitId: string;
  toUnitId: string;
  status: ReturnStatus;
  reason: string | null;
  note: string | null;
  photoFileIds: string[];
  returnCarrier: string | null;
  returnTrackingNo: string | null;
  createdBy: string | null;
  processedBy: string | null;
  processedAt: string | null;
  processedNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** 联表带出（展示用）。 */
  fromUnitName?: string | null;
  toUnitName?: string | null;
  shipmentNo?: string | null;
  salesOrderNo?: string | null;
}

/** 退货单详情 DTO（在列表 DTO 基础上附带明细）。 */
export interface ReturnOrderDetailDto extends ReturnOrderDto {
  items: ReturnOrderItemDto[];
}
