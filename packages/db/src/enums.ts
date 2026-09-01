import { pgEnum } from 'drizzle-orm/pg-core';

// ── 枚举定义───────────────────────────────────────────

export const unitTypeEnum = pgEnum('unit_type', ['COLLECTOR', 'WAREHOUSE', 'RETAILER']);
export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'COLLECTOR', 'WAREHOUSE', 'RETAILER']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'PENDING', 'DISABLED']);
export const specUnitEnum = pgEnum('spec_unit', ['PIECE', 'BAG', 'BOX', 'PACK', 'SET', 'OTHER']);
export const itemStatusEnum = pgEnum('item_status', ['ACTIVE', 'INACTIVE']);

export const shipmentStatusEnum = pgEnum('shipment_status', [
  'DRAFT',
  'SENT',
  'COUNTING',
  'READY',
  'DISCREPANCY',
  'REVIEW_PENDING',
  'INBOUNDED',
  'RETURN_PENDING',
  'RETURNED',
]);

export const reviewStatusEnum = pgEnum('discrepancy_review_status', ['PENDING', 'APPROVED', 'REJECTED']);

export const batchSourceTypeEnum = pgEnum('batch_source_type', [
  'SHIPMENT',
  'MANUAL',
  'RETURNS_PENDING',
]);

export const inboundSourceTypeEnum = pgEnum('inbound_source_type', ['SHIPMENT', 'MANUAL']);
export const inboundStatusEnum = pgEnum('inbound_status', ['DRAFT', 'POSTED']);

export const outboundTypeEnum = pgEnum('outbound_type', ['NORMAL', 'LOSS']);
export const outboundStatusEnum = pgEnum('outbound_status', ['DRAFT', 'POSTED']);

export const returnSourceTypeEnum = pgEnum('return_source_type', ['SHIPMENT', 'SALES']);
export const returnStatusEnum = pgEnum('return_status', [
  'PENDING',
  'CLOSED',
  'REJECTED',
  'REQUESTED',
  'APPROVED',
  'RETURNED',
  'CANCELLED',
]);

export const salesSourceEnum = pgEnum('sales_source', ['RETAILER_REQUEST', 'WAREHOUSE_INITIATED']);
export const deliveryMethodEnum = pgEnum('delivery_method', ['PICKUP', 'EXPRESS', 'LOGISTICS']);
export const salesStatusEnum = pgEnum('sales_status', [
  'DRAFT',
  'SENT',
  'PAYMENT_UPLOADED',
  'CONFIRMED',
  'CANCELLED',
]);

export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'INBOUND_SHIPMENT',
  'INBOUND_MANUAL',
  'OUTBOUND_NORMAL',
  'OUTBOUND_LOSS',
  'OUTBOUND_SALE',
  'OUTBOUND_SALE_REVERSAL',
  'RETURN_IN',
  'RETURN_OUT',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'SHIPMENT_TRANSFER',
  'DISCREPANCY',
  'RETURN',
  'AFTER_SALE',
  'SALES',
  'INBOUND',
  'OUTBOUND',
  'EXPIRY_ALERT',
  'PAYMENT',
  'SYSTEM',
  'SHIPMENT_SENT',
  'INBOUND_CONFIRMED',
  'SHIPMENT_RETURN_PENDING',
  'REVIEW_PENDING',
  'REVIEW_APPROVED',
  'REVIEW_REJECTED',
  'SALES_SENT',
  'SALES_CANCELLED',
  'SALES_PAYMENT_UPLOADED',
  'SALES_CONFIRMED',
  'AFTER_SALE_REQUESTED',
  'RETURN_ACCEPTED',
  'AFTER_SALE_APPROVED',
  'AFTER_SALE_RETURNED',
]);

export const emailLogStatusEnum = pgEnum('email_log_status', ['PENDING', 'SENT', 'FAILED']);

// ── 常用枚举类型导出（供 shared / api 复用）────────────────────────────────────

export type UnitType = (typeof unitTypeEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type SpecUnit = (typeof specUnitEnum.enumValues)[number];
export type ItemStatus = (typeof itemStatusEnum.enumValues)[number];
export type ShipmentStatus = (typeof shipmentStatusEnum.enumValues)[number];
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
export type BatchSourceType = (typeof batchSourceTypeEnum.enumValues)[number];
export type InboundSourceType = (typeof inboundSourceTypeEnum.enumValues)[number];
export type InboundStatus = (typeof inboundStatusEnum.enumValues)[number];
export type OutboundType = (typeof outboundTypeEnum.enumValues)[number];
export type OutboundStatus = (typeof outboundStatusEnum.enumValues)[number];
export type ReturnSourceType = (typeof returnSourceTypeEnum.enumValues)[number];
export type ReturnStatus = (typeof returnStatusEnum.enumValues)[number];
export type SalesSource = (typeof salesSourceEnum.enumValues)[number];
export type DeliveryMethod = (typeof deliveryMethodEnum.enumValues)[number];
export type SalesStatus = (typeof salesStatusEnum.enumValues)[number];
export type StockMovementType = (typeof stockMovementTypeEnum.enumValues)[number];
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type EmailLogStatus = (typeof emailLogStatusEnum.enumValues)[number];
