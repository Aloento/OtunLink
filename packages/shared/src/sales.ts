// 销售单：来源、送货方式、状态、DTO。
// 与 packages/db/src/enums.ts 的 pgEnum 保持一致（数据库层枚举）。

import type { Paged } from './items';

export const SALES_SOURCES = ['RETAILER_REQUEST', 'WAREHOUSE_INITIATED'] as const;
export type SalesSource = (typeof SALES_SOURCES)[number];

export const DELIVERY_METHODS = ['PICKUP', 'EXPRESS', 'LOGISTICS'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const SALES_STATUSES = ['DRAFT', 'SENT', 'PAYMENT_UPLOADED', 'CONFIRMED', 'CANCELLED'] as const;
export type SalesStatus = (typeof SALES_STATUSES)[number];

export interface SalesOrderItemDto {
  id: string;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  qty: string;
  /** 默认零售价快照（保存时的 retail_prices.price），可能为空。 */
  listPrice: string | null;
  /** 快照零售价的货币（取自 retail_prices.currency）；无快照为 null。 */
  listPriceCurrency: string | null;
  /** 成交价，恒为本单货币。 */
  price: string | null;
  /** 成交价货币（= 本单货币 order.currency）。 */
  priceCurrency: string;
  /** 该行是否填写了行级改价（价格未沿用默认零售价快照）。 */
  priceOverridden: boolean;
  lineTotal: string | null;
}

export interface SalesBatchAllocationDto {
  id: string;
  orderItemId: string;
  itemId: string;
  itemName: string | null;
  batchId: string;
  batchNo: string | null;
  expiryDate: string | null;
  qty: string;
}

export interface PaymentDto {
  id: string;
  salesOrderId: string;
  amount: string;
  currency: string;
  methodNote: string | null;
  proofFileId: string | null;
  refundNote: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
}

export interface SalesOrderDto {
  id: string;
  salesNo: string;
  sellerUnitId: string;
  sellerUnitName: string | null;
  buyerUnitId: string;
  buyerUnitName: string | null;
  source: SalesSource;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string | null;
  carrier: string | null;
  trackingNo: string | null;
  freight: string | null;
  discountPercent: string;
  currency: string;
  totalAmount: string | null;
  status: SalesStatus;
  remark: string | null;
  sentAt: string | null;
  confirmedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  hasPayment: boolean;
}

export interface SalesOrderDetailDto extends SalesOrderDto {
  items: SalesOrderItemDto[];
  allocations: SalesBatchAllocationDto[];
  payment: PaymentDto | null;
}

export type SalesListResult = Paged<SalesOrderDto>;
