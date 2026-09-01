// 销售单（ck-09a）：来源、送货方式、状态、DTO。
// 与 packages/db/src/enums.ts 的 pgEnum 保持一致（数据库层枚举）。

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
  listPrice: string | null;
  price: string | null;
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

export interface SalesListResult {
  items: SalesOrderDto[];
  total: number;
}
