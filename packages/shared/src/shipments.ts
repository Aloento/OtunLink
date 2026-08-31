// 发货单相关的类型与常量（design.md §4.2 / §5.1 / §8.4）。
// 与 packages/db 的 shipment_status 枚举保持语义一致；shared 只放前后端共用的
// 类型与常量，数据库层枚举在 packages/db/src/enums.ts 独立维护。

export const SHIPMENT_STATUSES = [
  'DRAFT',
  'SENT',
  'COUNTING',
  'READY',
  'DISCREPANCY',
  'REVIEW_PENDING',
  'INBOUNDED',
  'RETURN_PENDING',
  'RETURNED',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** 物流单号 DTO（shipment_trackings）。 */
export interface ShipmentTrackingDto {
  id: string;
  carrier: string;
  trackingNo: string;
  note: string | null;
  createdAt: string;
}

/** 发货单明细 DTO（shipment_items，含效期上报与快照列）。 */
export interface ShipmentItemDto {
  id: string;
  itemId: string | null;
  /** 下单时的物品名称快照。 */
  name: string;
  /** 下单时的规格快照（spec_unit 文案键值）。 */
  spec: string | null;
  expectedQty: string;
  actualQty: string | null;
  unitPrice: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  lineNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 发货单列表 DTO（含物流单号，便于列表渲染「物流单号卡片」）。 */
export interface ShipmentDto {
  id: string;
  shipmentNo: string;
  shipperUnitId: string;
  receiverUnitId: string;
  /** 发货方名称（联表带出，展示用）。 */
  shipperName: string | null;
  /** 收货方名称（联表带出，展示用）。 */
  receiverName: string | null;
  status: ShipmentStatus;
  /** 点货版本号（乐观并发：保存点货时携带；每次点货保存 +1）。 */
  countVersion: number;
  boxesCount: number;
  currency: string;
  expectedArrivalDate: string | null;
  remark: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  trackings: ShipmentTrackingDto[];
}

/** 发货单详情 DTO（在列表 DTO 基础上附带清单）。 */
export interface ShipmentDetailDto extends ShipmentDto {
  items: ShipmentItemDto[];
  /** 差异修订记录（按创建时间倒序；详见 §4.2 discrepancy_reviews）。 */
  reviews: DiscrepancyReviewDto[];
}

/** 差异修订明细 DTO（discrepancy_review_items）。 */
export interface DiscrepancyReviewItemDto {
  id: string;
  reviewId: string;
  shipmentItemId: string;
  /** 修订前应收（快照，审计用）。 */
  expectedQtyBefore: string;
  /** 修订目标（= 仓库点货实收）。 */
  actualQty: string;
  reason: string | null;
}

/** 差异修订 DTO（discrepancy_reviews）。 */
export interface DiscrepancyReviewDto {
  id: string;
  shipmentId: string;
  status: ReviewStatus;
  /** 集货方拒绝理由（或提交时整单备注）。 */
  reason: string | null;
  photoFileIds: string[];
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: DiscrepancyReviewItemDto[];
}
