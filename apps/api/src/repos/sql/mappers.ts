// 数据库行 → 领域记录映射（与 types.ts 中的记录类型一一对应）。
import { expiryRemainingDays, type MinSaleUnit } from '@otunlink/shared';
import type { AuditLogRecord, DiscrepancyReviewItemRecord, DiscrepancyReviewRecord, EmailLogRecord, FileRecord, InboundOrderItemRecord, InboundOrderRecord, ItemRecord, NotificationRecord, OutboundOrderItemRecord, OutboundOrderRecord, PartnershipRecord, PaymentRecord, RetailPriceHistoryRecord, RetailPriceRecord, ReturnOrderItemRecord, ReturnOrderRecord, SalesBatchAllocationRecord, SalesOrderItemRecord, SalesOrderRecord, ShipmentItemRecord, ShipmentRecord, ShipmentTrackingRecord, StockBatchRecord, StockMovementRecord, StockRowRecord, UnitRecord, UserRecord } from '../../types';
import { parseJson, toYMD } from './helpers';

export function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    entraSub: String(row.entra_sub),
    email: String(row.email),
    name: String(row.name),
    role: (row.role as UserRecord['role']) ?? null,
    scopeUnitId: row.scope_unit_id ? String(row.scope_unit_id) : null,
    status: (row.status as UserRecord['status']) ?? 'PENDING',
    locale: String(row.locale ?? 'zh-CN'),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapUnit(row: Record<string, unknown>): UnitRecord {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    type: row.type as UnitRecord['type'],
    address: row.address ? String(row.address) : null,
    contact: row.contact ? String(row.contact) : null,
    isActive: row.is_active === true || row.is_active === 'true' || row.is_active === 't',
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapItem(row: Record<string, unknown>): ItemRecord {
  return {
    id: String(row.id),
    sku: row.sku ? String(row.sku) : null,
    name: String(row.name),
    barcode: row.barcode ? String(row.barcode) : null,
    specUnit: (row.spec_unit as ItemRecord['specUnit']) ?? 'PIECE',
    innerUnit: row.inner_unit ? (row.inner_unit as ItemRecord['innerUnit']) : null,
    innerCount: row.inner_count != null ? String(row.inner_count) : null,
    minSaleUnit: (row.min_sale_unit as ItemRecord['minSaleUnit']) ?? 'SPEC',
    isPerishable: row.is_perishable === true || row.is_perishable === 'true' || row.is_perishable === 't',
    category: row.category ? String(row.category) : null,
    description: row.description ? String(row.description) : null,
    status: (row.status as ItemRecord['status']) ?? 'ACTIVE',
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapFile(row: Record<string, unknown>): FileRecord {
  return {
    id: String(row.id),
    key: String(row.key),
    thumbnailKey: row.thumbnail_key ? String(row.thumbnail_key) : null,
    mime: String(row.mime),
    size: Number(row.size),
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export function mapShipment(row: Record<string, unknown>): ShipmentRecord {
  return {
    id: String(row.id),
    shipmentNo: String(row.shipment_no),
    shipperUnitId: String(row.shipper_unit_id),
    receiverUnitId: String(row.receiver_unit_id),
    status: (row.status as ShipmentRecord['status']) ?? 'DRAFT',
    boxesCount: Number(row.boxes_count ?? 0),
    currency: String(row.currency ?? 'CNY'),
    expectedArrivalDate: toYMD(row.expected_arrival_date),
    remark: row.remark ? String(row.remark) : null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    countVersion: Number(row.count_version ?? 0),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapShipmentTracking(row: Record<string, unknown>): ShipmentTrackingRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    carrier: String(row.carrier),
    trackingNo: String(row.tracking_no),
    note: row.note ? String(row.note) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export function mapShipmentItem(row: Record<string, unknown>): ShipmentItemRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    itemId: row.item_id ? String(row.item_id) : null,
    name: row.item_name != null ? String(row.item_name) : '',
    spec: row.spec ? String(row.spec) : null,
    minSaleUnit: row.min_sale_unit ? (String(row.min_sale_unit) as MinSaleUnit) : null,
    expectedQty: row.expected_qty != null ? String(row.expected_qty) : '0',
    actualQty: row.actual_qty != null ? String(row.actual_qty) : null,
    unitPrice: row.unit_price != null ? String(row.unit_price) : null,
    productionDate: toYMD(row.production_date),
    expiryDate: toYMD(row.expiry_date),
    lineNote: row.line_note ? String(row.line_note) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapDiscrepancyReviewItem(row: Record<string, unknown>): DiscrepancyReviewItemRecord {
  return {
    id: String(row.id),
    reviewId: String(row.review_id),
    shipmentItemId: String(row.shipment_item_id),
    expectedQtyBefore: String(row.expected_qty_before),
    actualQty: String(row.actual_qty),
    reason: row.reason ? String(row.reason) : null,
  };
}

function parsePhotoIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (text.startsWith('{') && text.endsWith('}')) {
    return text
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/"/g, ''))
      .filter(Boolean);
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function mapDiscrepancyReview(row: Record<string, unknown>): DiscrepancyReviewRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    status: (row.status as DiscrepancyReviewRecord['status']) ?? 'PENDING',
    reason: row.reason ? String(row.reason) : null,
    photoFileIds: parsePhotoIds(row.photo_file_ids),
    submittedBy: row.submitted_by ? String(row.submitted_by) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapInbound(row: Record<string, unknown>): InboundOrderRecord {
  return {
    id: String(row.id),
    inboundNo: String(row.inbound_no),
    sourceType: (row.source_type as InboundOrderRecord['sourceType']) ?? 'SHIPMENT',
    shipmentId: row.shipment_id ? String(row.shipment_id) : null,
    warehouseUnitId: String(row.warehouse_unit_id),
    counterpartyUnitId: row.counterparty_unit_id ? String(row.counterparty_unit_id) : null,
    status: (row.status as InboundOrderRecord['status']) ?? 'DRAFT',
    remark: row.remark ? String(row.remark) : null,
    photoFileIds: parsePhotoIds(row.photo_file_ids),
    postedBy: row.posted_by ? String(row.posted_by) : null,
    postedAt: row.posted_at ? new Date(String(row.posted_at)) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapInboundItem(row: Record<string, unknown>): InboundOrderItemRecord {
  return {
    id: String(row.id),
    inboundOrderId: String(row.inbound_order_id),
    itemId: String(row.item_id),
    batchId: row.batch_id ? String(row.batch_id) : null,
    qty: row.qty != null ? String(row.qty) : '0',
    unitCost: row.unit_cost != null ? String(row.unit_cost) : '0',
    lineNote: row.line_note ? String(row.line_note) : null,
    productionDate: toYMD(row.production_date),
    expiryDate: toYMD(row.expiry_date),
    batchNo: row.batch_no ? String(row.batch_no) : null,
    createdAt: new Date(String(row.created_at)),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
  };
}

export function mapReturn(row: Record<string, unknown>): ReturnOrderRecord {
  return {
    id: String(row.id),
    returnNo: String(row.return_no),
    sourceType: (row.source_type as ReturnOrderRecord['sourceType']) ?? 'SHIPMENT',
    shipmentId: row.shipment_id ? String(row.shipment_id) : null,
    salesOrderId: row.sales_order_id ? String(row.sales_order_id) : null,
    fromUnitId: String(row.from_unit_id),
    toUnitId: String(row.to_unit_id),
    status: (row.status as ReturnOrderRecord['status']) ?? 'PENDING',
    reason: row.reason ? String(row.reason) : null,
    note: row.note ? String(row.note) : null,
    photoFileIds: parsePhotoIds(row.photo_file_ids),
    returnCarrier: row.return_carrier ? String(row.return_carrier) : null,
    returnTrackingNo: row.return_tracking_no ? String(row.return_tracking_no) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    processedBy: row.processed_by ? String(row.processed_by) : null,
    processedAt: row.processed_at ? new Date(String(row.processed_at)) : null,
    processedNote: row.processed_note ? String(row.processed_note) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapReturnItem(row: Record<string, unknown>): ReturnOrderItemRecord {
  return {
    id: String(row.id),
    returnOrderId: String(row.return_order_id),
    itemId: String(row.item_id),
    shipmentItemId: row.shipment_item_id ? String(row.shipment_item_id) : null,
    salesOrderItemId: row.sales_order_item_id ? String(row.sales_order_item_id) : null,
    qty: row.qty != null ? String(row.qty) : '0',
    receivedQty: row.received_qty != null ? String(row.received_qty) : null,
    originalBatchId: row.original_batch_id ? String(row.original_batch_id) : null,
    reason: row.reason ? String(row.reason) : null,
    createdAt: new Date(String(row.created_at)),
    itemName: row.item_name ? String(row.item_name) : null,
    pendingQc: row.original_batch_source_type === 'RETURNS_PENDING',
  };
}

export function mapOutbound(row: Record<string, unknown>): OutboundOrderRecord {
  return {
    id: String(row.id),
    outboundNo: String(row.outbound_no),
    type: (row.type as OutboundOrderRecord['type']) ?? 'NORMAL',
    warehouseUnitId: String(row.warehouse_unit_id),
    counterpartyUnitId: row.counterparty_unit_id ? String(row.counterparty_unit_id) : null,
    status: (row.status as OutboundOrderRecord['status']) ?? 'DRAFT',
    lossReason: row.loss_reason ? String(row.loss_reason) : null,
    photoFileIds: parsePhotoIds(row.photo_file_ids),
    remark: row.remark ? String(row.remark) : null,
    postedBy: row.posted_by ? String(row.posted_by) : null,
    postedAt: row.posted_at ? new Date(String(row.posted_at)) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapOutboundItem(row: Record<string, unknown>): OutboundOrderItemRecord {
  return {
    id: String(row.id),
    outboundOrderId: String(row.outbound_order_id),
    itemId: String(row.item_id),
    batchId: row.batch_id ? String(row.batch_id) : null,
    qty: row.qty != null ? String(row.qty) : '0',
    unitCost: row.unit_cost != null ? String(row.unit_cost) : null,
    createdAt: new Date(String(row.created_at)),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
    batchNo: row.batch_no ? String(row.batch_no) : null,
  };
}

export function mapStockRow(row: Record<string, unknown>): StockRowRecord {
  return {
    unitId: String(row.unit_id),
    unitName: row.unit_name ? String(row.unit_name) : null,
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
    minSaleUnit: row.min_sale_unit ? (String(row.min_sale_unit) as MinSaleUnit) : null,
    batchId: String(row.batch_id),
    batchNo: row.batch_no ? String(row.batch_no) : null,
    productionDate: toYMD(row.production_date),
    expiryDate: toYMD(row.expiry_date),
    qty: row.qty != null ? String(row.qty) : '0',
    avgCost: row.avg_cost != null ? String(row.avg_cost) : '0',
    version: Number(row.version ?? 0),
    updatedAt: new Date(String(row.updated_at)),
  };
}

/** 在库存行上叠加效期计算字段（UTC 当日基准，与 shared 纯函数一致）。 */
export function attachExpiry(row: StockRowRecord): StockBatchRecord {
  const remainingDays = expiryRemainingDays(row.expiryDate, new Date());
  return { ...row, remainingDays, isExpired: remainingDays !== null && remainingDays < 0 };
}

export function mapPartnership(row: Record<string, unknown>): PartnershipRecord {
  return {
    id: String(row.id),
    warehouseUnitId: String(row.warehouse_unit_id),
    warehouseUnitName: row.warehouse_unit_name ? String(row.warehouse_unit_name) : null,
    retailerUnitId: String(row.retailer_unit_id),
    retailerUnitName: row.retailer_unit_name ? String(row.retailer_unit_name) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export function mapStockMovement(row: Record<string, unknown>): StockMovementRecord {
  return {
    id: String(row.id),
    unitId: String(row.unit_id),
    unitName: row.unit_name ? String(row.unit_name) : null,
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
    batchId: String(row.batch_id),
    batchNo: row.batch_no ? String(row.batch_no) : null,
    type: row.type as StockMovementRecord['type'],
    qtyDelta: String(row.qty_delta),
    qtyBefore: String(row.qty_before),
    qtyAfter: String(row.qty_after),
    unitCost: row.unit_cost != null ? String(row.unit_cost) : null,
    orderType: row.order_type ? String(row.order_type) : null,
    orderId: row.order_id ? String(row.order_id) : null,
    refNo: row.ref_no ? String(row.ref_no) : null,
    note: row.note ? String(row.note) : null,
    operatorId: row.operator_id ? String(row.operator_id) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export function mapRetailPrice(row: Record<string, unknown>): RetailPriceRecord {
  return {
    id: String(row.id),
    unitId: String(row.unit_id),
    unitName: row.unit_name ? String(row.unit_name) : null,
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
    minSaleUnit: row.min_sale_unit ? (String(row.min_sale_unit) as MinSaleUnit) : null,
    price: row.price != null ? String(row.price) : '0',
    currency: String(row.currency ?? 'CNY'),
    unitCost: row.unit_cost != null ? String(row.unit_cost) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedByName: row.updated_by_name ? String(row.updated_by_name) : null,
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapRetailPriceHistory(row: Record<string, unknown>): RetailPriceHistoryRecord {
  return {
    id: String(row.id),
    unitId: String(row.unit_id),
    unitName: row.unit_name ? String(row.unit_name) : null,
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    price: row.price != null ? String(row.price) : '0',
    currency: String(row.currency ?? 'CNY'),
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedByName: row.updated_by_name ? String(row.updated_by_name) : null,
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function mapNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    unitId: row.unit_id ? String(row.unit_id) : null,
    type: String(row.type),
    title: String(row.title),
    content: row.content ? String(row.content) : null,
    link: row.link ? String(row.link) : null,
    readAt: row.read_at ? new Date(String(row.read_at)) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export function mapEmailLog(row: Record<string, unknown>): EmailLogRecord {
  return {
    id: String(row.id),
    toAddress: String(row.to_address),
    subject: row.subject ? String(row.subject) : null,
    body: row.body ? String(row.body) : null,
    status: (row.status as EmailLogRecord['status']) ?? 'PENDING',
    provider: row.provider ? String(row.provider) : null,
    error: row.error ? String(row.error) : null,
    attempts: row.attempts != null ? Number(row.attempts) : 0,
    sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export function mapAuditLog(row: Record<string, unknown>): AuditLogRecord {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    action: String(row.action),
    entityType: row.entity_type ? String(row.entity_type) : null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    before: parseJson(row.before),
    after: parseJson(row.after),
    ip: row.ip ? String(row.ip) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export function mapSalesOrder(row: Record<string, unknown>): SalesOrderRecord {
  return {
    id: String(row.id),
    salesNo: String(row.sales_no),
    sellerUnitId: String(row.seller_unit_id),
    buyerUnitId: String(row.buyer_unit_id),
    source: (row.source as SalesOrderRecord['source']) ?? 'RETAILER_REQUEST',
    deliveryMethod: (row.delivery_method as SalesOrderRecord['deliveryMethod']) ?? 'PICKUP',
    deliveryAddress: row.delivery_address ? String(row.delivery_address) : null,
    carrier: row.carrier ? String(row.carrier) : null,
    trackingNo: row.tracking_no ? String(row.tracking_no) : null,
    freight: row.freight != null ? String(row.freight) : '0',
    discountPercent: row.discount_percent != null ? String(row.discount_percent) : '0',
    currency: String(row.currency ?? 'CNY'),
    totalAmount: row.total_amount != null ? String(row.total_amount) : null,
    status: (row.status as SalesOrderRecord['status']) ?? 'DRAFT',
    remark: row.remark ? String(row.remark) : null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
    confirmedAt: row.confirmed_at ? new Date(String(row.confirmed_at)) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    hasPayment: row.has_payment === true || row.has_payment === 'true' || row.has_payment === 't',
  };
}

export function mapSalesItem(row: Record<string, unknown>): SalesOrderItemRecord {
  return {
    id: String(row.id),
    salesOrderId: String(row.sales_order_id),
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
    minSaleUnit: row.min_sale_unit ? (String(row.min_sale_unit) as MinSaleUnit) : null,
    qty: row.qty != null ? String(row.qty) : '0',
    listPrice: row.list_price != null ? String(row.list_price) : null,
    listPriceCurrency: row.list_price_currency != null ? String(row.list_price_currency) : null,
    price: row.price != null ? String(row.price) : null,
    lineTotal: row.line_total != null ? String(row.line_total) : null,
  };
}

export function mapSalesAllocation(row: Record<string, unknown>): SalesBatchAllocationRecord {
  return {
    id: String(row.id),
    orderItemId: String(row.order_item_id),
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    batchId: String(row.batch_id),
    batchNo: row.batch_no ? String(row.batch_no) : null,
    expiryDate: toYMD(row.expiry_date),
    qty: row.qty != null ? String(row.qty) : '0',
  };
}

export function mapPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    id: String(row.id),
    salesOrderId: String(row.sales_order_id),
    amount: row.amount != null ? String(row.amount) : '0',
    currency: String(row.currency ?? 'CNY'),
    methodNote: row.method_note ? String(row.method_note) : null,
    proofFileId: row.proof_file_id ? String(row.proof_file_id) : null,
    refundNote: row.refund_note ? String(row.refund_note) : null,
    uploadedBy: row.uploaded_by ? String(row.uploaded_by) : null,
    uploadedAt: new Date(String(row.uploaded_at)),
  };
}
