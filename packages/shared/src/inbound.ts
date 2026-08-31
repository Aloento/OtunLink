// 入库单相关的类型与常量（design.md §4.2 / §5.3）。
// 与 packages/db 的 inbound_status / inbound_source_type 枚举保持语义一致。

export const INBOUND_STATUSES = ['DRAFT', 'POSTED'] as const;
export type InboundStatus = (typeof INBOUND_STATUSES)[number];

export const INBOUND_SOURCE_TYPES = ['SHIPMENT', 'MANUAL'] as const;
export type InboundSourceType = (typeof INBOUND_SOURCE_TYPES)[number];

/** 入库单明细 DTO（inbound_order_items，含确认收货时捕获的批次信息）。 */
export interface InboundOrderItemDto {
  id: string;
  inboundOrderId: string;
  itemId: string;
  /** POST 后回填；DRAFT 阶段为 null。 */
  batchId: string | null;
  qty: string;
  /** 成本价：发货单行原始价格快照（POST 后不可变）。 */
  unitCost: string;
  productionDate: string | null;
  expiryDate: string | null;
  batchNo: string | null;
  lineNote: string | null;
  createdAt: string;
  /** 联表带出（展示用）。 */
  itemName?: string | null;
  spec?: string | null;
}

/** 入库单 DTO（inbound_orders）。 */
export interface InboundOrderDto {
  id: string;
  inboundNo: string;
  sourceType: InboundSourceType;
  shipmentId: string | null;
  warehouseUnitId: string;
  counterpartyUnitId: string | null;
  status: InboundStatus;
  remark: string | null;
  photoFileIds: string[];
  postedBy: string | null;
  postedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** 联表带出（展示用）。 */
  warehouseName?: string | null;
  counterpartyName?: string | null;
  shipmentNo?: string | null;
}

/** 入库单详情 DTO（在列表 DTO 基础上附带明细）。 */
export interface InboundOrderDetailDto extends InboundOrderDto {
  items: InboundOrderItemDto[];
}
