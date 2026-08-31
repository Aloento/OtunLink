import type {
  DiscrepancyReviewItemRecord,
  DiscrepancyReviewRecord,
  FileRecord,
  InboundOrderItemRecord,
  InboundOrderRecord,
  ItemImageRecord,
  ItemRecord,
  OutboundOrderItemRecord,
  OutboundOrderRecord,
  ReturnOrderItemRecord,
  ReturnOrderRecord,
  RetailPriceHistoryRecord,
  RetailPriceRecord,
  ShipmentItemRecord,
  ShipmentRecord,
  ShipmentTrackingRecord,
  SalesBatchAllocationRecord,
  SalesOrderItemRecord,
  SalesOrderRecord,
  PaymentRecord,
  StockBatchRecord,
  StockMovementRecord,
  StockRowRecord,
  UnitRecord,
  UserRecord,
} from '../types';

// 对外 DTO：剥离内部/敏感字段（entraSub 属于租户身份标识，不下发到前端）。

export function publicUserDto(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopeUnitId: user.scopeUnitId,
    status: user.status,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function adminUserDto(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopeUnitId: user.scopeUnitId,
    status: user.status,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function unitDto(unit: UnitRecord) {
  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    type: unit.type,
    address: unit.address,
    contact: unit.contact,
    timezone: unit.timezone,
    baseCurrency: unit.baseCurrency,
    isActive: unit.isActive,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}

export function itemDto(item: ItemRecord) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    barcode: item.barcode,
    specUnit: item.specUnit,
    innerUnit: item.innerUnit,
    innerCount: item.innerCount,
    isPerishable: item.isPerishable,
    category: item.category,
    description: item.description,
    status: item.status,
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function fileDto(file: FileRecord) {
  return {
    id: file.id,
    key: file.key,
    thumbnailKey: file.thumbnailKey,
    mime: file.mime,
    size: file.size,
    width: file.width,
    height: file.height,
    hasThumbnail: file.thumbnailKey !== null,
    createdAt: file.createdAt.toISOString(),
  };
}

export function itemImageDto(image: ItemImageRecord) {
  return {
    id: image.id,
    itemId: image.itemId,
    fileId: image.fileId,
    isPrimary: image.isPrimary,
    sortOrder: image.sortOrder,
    createdAt: image.createdAt.toISOString(),
    ...(image.file ? { file: fileDto(image.file) } : {}),
  };
}

export function shipmentTrackingDto(tracking: ShipmentTrackingRecord) {
  return {
    id: tracking.id,
    carrier: tracking.carrier,
    trackingNo: tracking.trackingNo,
    note: tracking.note,
    createdAt: tracking.createdAt.toISOString(),
  };
}

export function shipmentItemDto(item: ShipmentItemRecord) {
  return {
    id: item.id,
    itemId: item.itemId,
    name: item.name,
    spec: item.spec,
    expectedQty: item.expectedQty,
    actualQty: item.actualQty,
    unitPrice: item.unitPrice,
    productionDate: item.productionDate,
    expiryDate: item.expiryDate,
    lineNote: item.lineNote,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function shipmentDto(
  shipment: ShipmentRecord,
  options: {
    shipperName: string | null;
    receiverName: string | null;
    trackings: ShipmentTrackingRecord[];
  },
) {
  return {
    id: shipment.id,
    shipmentNo: shipment.shipmentNo,
    shipperUnitId: shipment.shipperUnitId,
    receiverUnitId: shipment.receiverUnitId,
    shipperName: options.shipperName,
    receiverName: options.receiverName,
    status: shipment.status,
    countVersion: shipment.countVersion,
    boxesCount: shipment.boxesCount,
    currency: shipment.currency,
    expectedArrivalDate: shipment.expectedArrivalDate,
    remark: shipment.remark,
    sentAt: shipment.sentAt ? shipment.sentAt.toISOString() : null,
    createdBy: shipment.createdBy,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
    trackings: options.trackings.map(shipmentTrackingDto),
  };
}

// ── 差异修订 DTO（ck-06）───────────────────────────────────────────────────────

export function discrepancyReviewItemDto(item: DiscrepancyReviewItemRecord) {
  return {
    id: item.id,
    reviewId: item.reviewId,
    shipmentItemId: item.shipmentItemId,
    expectedQtyBefore: item.expectedQtyBefore,
    actualQty: item.actualQty,
    reason: item.reason,
  };
}

export function discrepancyReviewDto(review: DiscrepancyReviewRecord) {
  return {
    id: review.id,
    shipmentId: review.shipmentId,
    status: review.status,
    reason: review.reason,
    photoFileIds: review.photoFileIds,
    submittedBy: review.submittedBy,
    reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt ? review.reviewedAt.toISOString() : null,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    items: (review.items ?? []).map(discrepancyReviewItemDto),
  };
}

// ── 确认入库与发货退货 DTO（ck-07）─────────────────────────────────────────────

export function inboundItemDto(item: InboundOrderItemRecord) {
  return {
    id: item.id,
    inboundOrderId: item.inboundOrderId,
    itemId: item.itemId,
    batchId: item.batchId,
    qty: item.qty,
    unitCost: item.unitCost,
    lineNote: item.lineNote,
    productionDate: item.productionDate,
    expiryDate: item.expiryDate,
    batchNo: item.batchNo,
    createdAt: item.createdAt.toISOString(),
    itemName: item.itemName ?? null,
    spec: item.spec ?? null,
  };
}

export function inboundDto(
  inbound: InboundOrderRecord,
  options: {
    warehouseName: string | null;
    counterpartyName: string | null;
    shipmentNo: string | null;
  },
) {
  return {
    id: inbound.id,
    inboundNo: inbound.inboundNo,
    sourceType: inbound.sourceType,
    shipmentId: inbound.shipmentId,
    warehouseUnitId: inbound.warehouseUnitId,
    counterpartyUnitId: inbound.counterpartyUnitId,
    warehouseName: options.warehouseName,
    counterpartyName: options.counterpartyName,
    shipmentNo: options.shipmentNo,
    status: inbound.status,
    remark: inbound.remark,
    photoFileIds: inbound.photoFileIds,
    postedBy: inbound.postedBy,
    postedAt: inbound.postedAt ? inbound.postedAt.toISOString() : null,
    createdBy: inbound.createdBy,
    createdAt: inbound.createdAt.toISOString(),
    updatedAt: inbound.updatedAt.toISOString(),
  };
}

export function returnItemDto(item: ReturnOrderItemRecord) {
  return {
    id: item.id,
    returnOrderId: item.returnOrderId,
    itemId: item.itemId,
    shipmentItemId: item.shipmentItemId,
    salesOrderItemId: item.salesOrderItemId,
    qty: item.qty,
    receivedQty: item.receivedQty,
    originalBatchId: item.originalBatchId,
    pendingQc: item.pendingQc ?? false,
    reason: item.reason,
    createdAt: item.createdAt.toISOString(),
    itemName: item.itemName ?? null,
  };
}

export function returnDto(
  order: ReturnOrderRecord,
  options: {
    fromUnitName: string | null;
    toUnitName: string | null;
    shipmentNo: string | null;
    salesOrderNo?: string | null;
  },
) {
  return {
    id: order.id,
    returnNo: order.returnNo,
    sourceType: order.sourceType,
    shipmentId: order.shipmentId,
    salesOrderId: order.salesOrderId,
    fromUnitId: order.fromUnitId,
    toUnitId: order.toUnitId,
    fromUnitName: options.fromUnitName,
    toUnitName: options.toUnitName,
    shipmentNo: options.shipmentNo,
    salesOrderNo: options.salesOrderNo ?? null,
    status: order.status,
    reason: order.reason,
    note: order.note,
    photoFileIds: order.photoFileIds,
    returnCarrier: order.returnCarrier,
    returnTrackingNo: order.returnTrackingNo,
    createdBy: order.createdBy,
    processedBy: order.processedBy,
    processedAt: order.processedAt ? order.processedAt.toISOString() : null,
    processedNote: order.processedNote,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

// ── 库存台账与手动出入库 DTO（ck-08a）──────────────────────────────────────────

export function outboundItemDto(item: OutboundOrderItemRecord) {
  return {
    id: item.id,
    outboundOrderId: item.outboundOrderId,
    itemId: item.itemId,
    batchId: item.batchId,
    qty: item.qty,
    unitCost: item.unitCost,
    createdAt: item.createdAt.toISOString(),
    itemName: item.itemName ?? null,
    spec: item.spec ?? null,
    batchNo: item.batchNo ?? null,
  };
}

export function outboundDto(
  order: OutboundOrderRecord,
  options: {
    warehouseName: string | null;
    counterpartyName: string | null;
  },
) {
  return {
    id: order.id,
    outboundNo: order.outboundNo,
    type: order.type,
    warehouseUnitId: order.warehouseUnitId,
    counterpartyUnitId: order.counterpartyUnitId,
    warehouseName: options.warehouseName,
    counterpartyName: options.counterpartyName,
    status: order.status,
    lossReason: order.lossReason,
    photoFileIds: order.photoFileIds,
    remark: order.remark,
    postedBy: order.postedBy,
    postedAt: order.postedAt ? order.postedAt.toISOString() : null,
    createdBy: order.createdBy,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function stockRowDto(row: StockRowRecord, options: { hideCost?: boolean } = {}) {
  return {
    unitId: row.unitId,
    unitName: row.unitName,
    itemId: row.itemId,
    itemName: row.itemName,
    spec: row.spec,
    batchId: row.batchId,
    batchNo: row.batchNo,
    productionDate: row.productionDate,
    expiryDate: row.expiryDate,
    qty: row.qty,
    ...(options.hideCost ? {} : { avgCost: row.avgCost }),
    availableQty: row.qty,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function stockMovementDto(movement: StockMovementRecord, options: { hideCost?: boolean } = {}) {
  return {
    id: movement.id,
    unitId: movement.unitId,
    unitName: movement.unitName,
    itemId: movement.itemId,
    itemName: movement.itemName,
    spec: movement.spec,
    batchId: movement.batchId,
    batchNo: movement.batchNo,
    type: movement.type,
    qtyDelta: movement.qtyDelta,
    qtyBefore: movement.qtyBefore,
    qtyAfter: movement.qtyAfter,
    ...(options.hideCost ? {} : { unitCost: movement.unitCost }),
    orderType: movement.orderType,
    orderId: movement.orderId,
    refNo: movement.refNo,
    note: movement.note,
    operatorId: movement.operatorId,
    createdAt: movement.createdAt.toISOString(),
  };
}

// ── 效期视图与零售价 DTO（ck-08b）────────────────────────────────────────────

export function stockBatchDto(row: StockBatchRecord, options: { hideCost?: boolean } = {}) {
  return {
    ...stockRowDto(row, options),
    remainingDays: row.remainingDays,
    isExpired: row.isExpired,
  };
}

export function retailPriceDto(row: RetailPriceRecord, options: { hideCost?: boolean } = {}) {
  return {
    id: row.id,
    unitId: row.unitId,
    unitName: row.unitName,
    itemId: row.itemId,
    itemName: row.itemName,
    spec: row.spec,
    price: row.price,
    currency: row.currency,
    ...(options.hideCost ? {} : { unitCost: row.unitCost }),
    updatedBy: row.updatedBy,
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function retailPriceHistoryDto(row: RetailPriceHistoryRecord) {
  return {
    id: row.id,
    unitId: row.unitId,
    unitName: row.unitName,
    itemId: row.itemId,
    itemName: row.itemName,
    price: row.price,
    currency: row.currency,
    updatedBy: row.updatedBy,
    updatedByName: row.updatedByName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── 销售单 DTO（ck-09a）────────────────────────────────────────────────────────

export function salesOrderItemDto(item: SalesOrderItemRecord) {
  return {
    id: item.id,
    itemId: item.itemId,
    itemName: item.itemName ?? null,
    spec: item.spec ?? null,
    qty: item.qty,
    listPrice: item.listPrice,
    price: item.price,
    lineTotal: item.lineTotal,
  };
}

export function salesAllocationDto(allocation: SalesBatchAllocationRecord) {
  return {
    id: allocation.id,
    orderItemId: allocation.orderItemId,
    itemId: allocation.itemId,
    itemName: allocation.itemName ?? null,
    batchId: allocation.batchId,
    batchNo: allocation.batchNo ?? null,
    expiryDate: allocation.expiryDate ?? null,
    qty: allocation.qty,
  };
}

export function salesPaymentDto(payment: PaymentRecord) {
  return {
    id: payment.id,
    salesOrderId: payment.salesOrderId,
    amount: payment.amount,
    currency: payment.currency,
    methodNote: payment.methodNote,
    proofFileId: payment.proofFileId,
    refundNote: payment.refundNote,
    uploadedBy: payment.uploadedBy,
    uploadedAt: payment.uploadedAt.toISOString(),
  };
}

export function salesOrderDto(
  order: SalesOrderRecord,
  options: { sellerUnitName: string | null; buyerUnitName: string | null },
) {
  return {
    id: order.id,
    salesNo: order.salesNo,
    sellerUnitId: order.sellerUnitId,
    sellerUnitName: options.sellerUnitName,
    buyerUnitId: order.buyerUnitId,
    buyerUnitName: options.buyerUnitName,
    source: order.source,
    deliveryMethod: order.deliveryMethod,
    deliveryAddress: order.deliveryAddress,
    freight: order.freight,
    discountPercent: order.discountPercent,
    currency: order.currency,
    totalAmount: order.totalAmount,
    status: order.status,
    remark: order.remark,
    sentAt: order.sentAt ? order.sentAt.toISOString() : null,
    confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
    createdBy: order.createdBy,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    hasPayment: order.hasPayment,
  };
}
