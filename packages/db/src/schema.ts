import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  batchSourceTypeEnum,
  deliveryMethodEnum,
  emailLogStatusEnum,
  inboundSourceTypeEnum,
  inboundStatusEnum,
  itemStatusEnum,
  notificationTypeEnum,
  outboundStatusEnum,
  outboundTypeEnum,
  returnSourceTypeEnum,
  returnStatusEnum,
  reviewStatusEnum,
  salesSourceEnum,
  salesStatusEnum,
  shipmentStatusEnum,
  specUnitEnum,
  stockMovementTypeEnum,
  unitTypeEnum,
  userRoleEnum,
  userStatusEnum,
} from './enums';

// ── 公共列构造（TIMESTAMPTZ UTC、金额 NUMERIC(12,2)、主键 uuid）────

const pk = () => uuid('id').primaryKey().defaultRandom();

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

// ── 业务单元 business_units ───────────────────────────────────────────────────

export const businessUnits = pgTable('business_units', {
  id: pk(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  type: unitTypeEnum('type').notNull(),
  address: text('address'),
  contact: text('contact'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
  baseCurrency: varchar('base_currency', { length: 3 }).notNull().default('CNY'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── 用户 users ────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: pk(),
    entraSub: varchar('entra_sub', { length: 128 }).notNull().unique(),
    email: varchar('email', { length: 256 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    role: userRoleEnum('role'),
    scopeUnitId: uuid('scope_unit_id').references(() => businessUnits.id, { onDelete: 'set null' }),
    status: userStatusEnum('status').notNull().default('PENDING'),
    locale: varchar('locale', { length: 8 }).notNull().default('zh-CN'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_scope_unit_idx').on(table.scopeUnitId),
  ],
);

// ── 文件 files ────────────────────────────────────────────────────────────────

export const files = pgTable('files', {
  id: pk(),
  key: varchar('key', { length: 256 }).notNull().unique(),
  thumbnailKey: varchar('thumbnail_key', { length: 256 }),
  mime: varchar('mime', { length: 64 }).notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: createdAt(),
});

// ── 物品 items ────────────────────────────────────────────────────────────────

export const items = pgTable(
  'items',
  {
    id: pk(),
    sku: varchar('sku', { length: 64 }),
    name: varchar('name', { length: 256 }).notNull(),
    barcode: varchar('barcode', { length: 128 }),
    specUnit: specUnitEnum('spec_unit').notNull().default('PIECE'),
    innerUnit: specUnitEnum('inner_unit'),
    innerCount: numeric('inner_count', { precision: 12, scale: 2 }),
    isPerishable: boolean('is_perishable').notNull().default(false),
    category: varchar('category', { length: 128 }),
    description: text('description'),
    status: itemStatusEnum('status').notNull().default('ACTIVE'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('items_name_idx').on(table.name),
    index('items_category_idx').on(table.category),
    // 条码在 ACTIVE 内唯一（items 条码部分唯一）
    uniqueIndex('items_barcode_active_unique')
      .on(table.barcode)
      .where(sql`${table.status} = 'ACTIVE' AND ${table.barcode} IS NOT NULL`),
  ],
);

// ── 物品图片 item_images ──────────────────────────────────────────────────────

export const itemImages = pgTable(
  'item_images',
  {
    id: pk(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('item_images_item_idx').on(table.itemId)],
);

// ── 发货单 shipments ──────────────────────────────────────────────────────────

export const shipments = pgTable(
  'shipments',
  {
    id: pk(),
    shipmentNo: varchar('shipment_no', { length: 64 }).notNull().unique(),
    shipperUnitId: uuid('shipper_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    receiverUnitId: uuid('receiver_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    status: shipmentStatusEnum('status').notNull().default('DRAFT'),
    boxesCount: integer('boxes_count').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
    expectedArrivalDate: date('expected_arrival_date', { mode: 'date' }),
    remark: text('remark'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    // 点货草稿并发控制：前端保存携带版本号，服务端 CAS 更新。
    countVersion: integer('count_version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('shipments_shipper_idx').on(table.shipperUnitId),
    index('shipments_receiver_idx').on(table.receiverUnitId),
    index('shipments_status_idx').on(table.status),
  ],
);

// ── 发货单物流单号 shipment_trackings ─────────────────────────────────────────

export const shipmentTrackings = pgTable(
  'shipment_trackings',
  {
    id: pk(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    carrier: varchar('carrier', { length: 64 }).notNull(),
    trackingNo: varchar('tracking_no', { length: 128 }).notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('shipment_trackings_carrier_tracking_unique').on(table.carrier, table.trackingNo),
    index('shipment_trackings_shipment_idx').on(table.shipmentId),
  ],
);

// ── 发货单明细 shipment_items（含效期上报、快照列）────────────────────────────

export const shipmentItems = pgTable(
  'shipment_items',
  {
    id: pk(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 256 }).notNull(),
    spec: varchar('spec', { length: 64 }),
    expectedQty: numeric('expected_qty', { precision: 12, scale: 2 }).notNull(),
    actualQty: numeric('actual_qty', { precision: 12, scale: 2 }),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }),
    productionDate: date('production_date', { mode: 'date' }),
    expiryDate: date('expiry_date', { mode: 'date' }),
    lineNote: text('line_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('shipment_items_shipment_idx').on(table.shipmentId)],
);

// ── 批次 batches ──────────────────────────────────────────────────────────────

export const batches = pgTable(
  'batches',
  {
    id: pk(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    batchNo: varchar('batch_no', { length: 64 }),
    productionDate: date('production_date', { mode: 'date' }),
    expiryDate: date('expiry_date', { mode: 'date' }),
    sourceType: batchSourceTypeEnum('source_type').notNull().default('MANUAL'),
    sourceOrderId: uuid('source_order_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('batches_item_idx').on(table.itemId),
    index('batches_expiry_idx').on(table.expiryDate),
    uniqueIndex('batches_item_batch_unique')
      .on(table.itemId, table.batchNo)
      .where(sql`${table.batchNo} IS NOT NULL`),
  ],
);

// ── 差异修订 discrepancy_reviews + 明细 ───────────────────────────────────────

export const discrepancyReviews = pgTable(
  'discrepancy_reviews',
  {
    id: pk(),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    status: reviewStatusEnum('status').notNull().default('PENDING'),
    reason: text('reason'),
    photoFileIds: uuid('photo_file_ids').array(),
    submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // 同一发货单同时仅一个 PENDING
    uniqueIndex('discrepancy_reviews_one_pending_unique')
      .on(table.shipmentId)
      .where(sql`${table.status} = 'PENDING'`),
    index('discrepancy_reviews_shipment_idx').on(table.shipmentId),
  ],
);

export const discrepancyReviewItems = pgTable(
  'discrepancy_review_items',
  {
    id: pk(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => discrepancyReviews.id, { onDelete: 'cascade' }),
    shipmentItemId: uuid('shipment_item_id')
      .notNull()
      .references(() => shipmentItems.id, { onDelete: 'cascade' }),
    expectedQtyBefore: numeric('expected_qty_before', { precision: 12, scale: 2 }).notNull(),
    actualQty: numeric('actual_qty', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason'),
  },
  (table) => [index('discrepancy_review_items_review_idx').on(table.reviewId)],
);

// ── 入库单 inbound_orders + 明细 ──────────────────────────────────────────────

export const inboundOrders = pgTable(
  'inbound_orders',
  {
    id: pk(),
    inboundNo: varchar('inbound_no', { length: 64 }).notNull().unique(),
    sourceType: inboundSourceTypeEnum('source_type').notNull(),
    shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'set null' }),
    warehouseUnitId: uuid('warehouse_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    counterpartyUnitId: uuid('counterparty_unit_id').references(() => businessUnits.id, {
      onDelete: 'set null',
    }),
    status: inboundStatusEnum('status').notNull().default('DRAFT'),
    remark: text('remark'),
    photoFileIds: uuid('photo_file_ids').array(),
    postedBy: uuid('posted_by').references(() => users.id, { onDelete: 'set null' }),
    postedAt: timestamp('posted_at', { withTimezone: true, mode: 'date' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('inbound_orders_warehouse_idx').on(table.warehouseUnitId),
    index('inbound_orders_shipment_idx').on(table.shipmentId),
  ],
);

export const inboundOrderItems = pgTable(
  'inbound_order_items',
  {
    id: pk(),
    inboundOrderId: uuid('inbound_order_id')
      .notNull()
      .references(() => inboundOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
    lineNote: text('line_note'),
    // 确认收货（DRAFT）时捕获的批次信息；POST 后据此建档并回填 batch_id。
    productionDate: date('production_date', { mode: 'date' }),
    expiryDate: date('expiry_date', { mode: 'date' }),
    batchNo: varchar('batch_no', { length: 64 }),
    createdAt: createdAt(),
  },
  (table) => [index('inbound_order_items_order_idx').on(table.inboundOrderId)],
);

// ── 出库单 outbound_orders + 明细（NORMAL / LOSS）────────────────────────────

export const outboundOrders = pgTable(
  'outbound_orders',
  {
    id: pk(),
    outboundNo: varchar('outbound_no', { length: 64 }).notNull().unique(),
    type: outboundTypeEnum('type').notNull().default('NORMAL'),
    warehouseUnitId: uuid('warehouse_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    counterpartyUnitId: uuid('counterparty_unit_id').references(() => businessUnits.id, {
      onDelete: 'set null',
    }),
    status: outboundStatusEnum('status').notNull().default('DRAFT'),
    lossReason: text('loss_reason'),
    photoFileIds: uuid('photo_file_ids').array(),
    remark: text('remark'),
    postedBy: uuid('posted_by').references(() => users.id, { onDelete: 'set null' }),
    postedAt: timestamp('posted_at', { withTimezone: true, mode: 'date' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('outbound_orders_warehouse_idx').on(table.warehouseUnitId)],
);

export const outboundOrderItems = pgTable(
  'outbound_order_items',
  {
    id: pk(),
    outboundOrderId: uuid('outbound_order_id')
      .notNull()
      .references(() => outboundOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }),
    createdAt: createdAt(),
  },
  (table) => [index('outbound_order_items_order_idx').on(table.outboundOrderId)],
);

// ── 销售单 sales_orders + 明细 + 批次分配 ─────────────────────────────────────

export const salesOrders = pgTable(
  'sales_orders',
  {
    id: pk(),
    salesNo: varchar('sales_no', { length: 64 }).notNull().unique(),
    sellerUnitId: uuid('seller_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    buyerUnitId: uuid('buyer_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    source: salesSourceEnum('source').notNull().default('RETAILER_REQUEST'),
    deliveryMethod: deliveryMethodEnum('delivery_method').notNull().default('PICKUP'),
    deliveryAddress: text('delivery_address'),
    carrier: text('carrier'),
    trackingNo: text('tracking_no'),
    freight: money('freight').notNull().default('0'),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
    totalAmount: money('total_amount'),
    status: salesStatusEnum('status').notNull().default('DRAFT'),
    remark: text('remark'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'sales_orders_discount_percent_range',
      sql`${table.discountPercent} >= 0 AND ${table.discountPercent} <= 100`,
    ),
    index('sales_orders_seller_idx').on(table.sellerUnitId),
    index('sales_orders_buyer_idx').on(table.buyerUnitId),
    index('sales_orders_status_idx').on(table.status),
  ],
);

export const salesOrderItems = pgTable(
  'sales_order_items',
  {
    id: pk(),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull(),
    listPrice: money('list_price'),
    price: money('price'),
    lineTotal: money('line_total'),
    createdAt: createdAt(),
  },
  (table) => [index('sales_order_items_order_idx').on(table.salesOrderId)],
);

export const salesBatchAllocations = pgTable(
  'sales_batch_allocations',
  {
    id: pk(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => salesOrderItems.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('sales_batch_allocations_item_batch_unique').on(table.orderItemId, table.batchId),
    index('sales_batch_allocations_batch_idx').on(table.batchId),
  ],
);

// ── 退货单 return_orders + 明细（SHIPMENT / SALES 两类）──────────────────────

export const returnOrders = pgTable(
  'return_orders',
  {
    id: pk(),
    returnNo: varchar('return_no', { length: 64 }).notNull().unique(),
    sourceType: returnSourceTypeEnum('source_type').notNull(),
    shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'set null' }),
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }),
    fromUnitId: uuid('from_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    toUnitId: uuid('to_unit_id')
      .notNull()
      .references(() => businessUnits.id),
    status: returnStatusEnum('status').notNull(),
    reason: text('reason'),
    note: text('note'),
    photoFileIds: uuid('photo_file_ids').array(),
    returnCarrier: varchar('return_carrier', { length: 64 }),
    returnTrackingNo: varchar('return_tracking_no', { length: 128 }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    // 集货方接受/拒绝的处理记录（SHIPMENT 来源退货闭环）。
    processedBy: uuid('processed_by').references(() => users.id, { onDelete: 'set null' }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    processedNote: text('processed_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('return_orders_shipment_idx').on(table.shipmentId),
    index('return_orders_sales_idx').on(table.salesOrderId),
    index('return_orders_from_idx').on(table.fromUnitId),
  ],
);

export const returnOrderItems = pgTable(
  'return_order_items',
  {
    id: pk(),
    returnOrderId: uuid('return_order_id')
      .notNull()
      .references(() => returnOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    // SHIPMENT 来源退货：关联到被拒收的发货清单行（入库前尚无批次，仅能定位到行）。
    shipmentItemId: uuid('shipment_item_id').references(() => shipmentItems.id, {
      onDelete: 'set null',
    }),
    // SALES 来源退货：关联到销售单行（用于计算可退数量与回补原批次）。
    salesOrderItemId: uuid('sales_order_item_id').references(() => salesOrderItems.id, {
      onDelete: 'set null',
    }),
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull(),
    /** 实收退货数量（SALES 退回收货后写入；null = 未收货）。 */
    receivedQty: numeric('received_qty', { precision: 12, scale: 2 }),
    originalBatchId: uuid('original_batch_id').references(() => batches.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (table) => [
    index('return_order_items_order_idx').on(table.returnOrderId),
    index('return_order_items_shipment_item_idx').on(table.shipmentItemId),
    index('return_order_items_sales_item_idx').on(table.salesOrderItemId),
  ],
);

// ── 付款 payments ─────────────────────────────────────────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .unique()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
    methodNote: varchar('method_note', { length: 256 }),
    proofFileId: uuid('proof_file_id').references(() => files.id, { onDelete: 'set null' }),
    refundNote: text('refund_note'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('payments_sales_order_idx').on(table.salesOrderId)],
);

// ── 库存 stock（仓库 × 物品 × 批次）──────────────────────────────────────────

export const stock = pgTable(
  'stock',
  {
    unitId: uuid('unit_id')
      .notNull()
      .references(() => businessUnits.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull().default('0'),
    avgCost: numeric('avg_cost', { precision: 12, scale: 2 }).notNull().default('0'),
    version: integer('version').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.unitId, table.itemId, table.batchId] }),
    check('stock_qty_nonnegative', sql`${table.qty} >= 0`),
    index('stock_item_idx').on(table.itemId),
    index('stock_batch_idx').on(table.batchId),
  ],
);

// ── 库存台账 stock_movements（只增不改删）─────────────────────────────────────

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: pk(),
    unitId: uuid('unit_id').notNull(),
    itemId: uuid('item_id').notNull(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    type: stockMovementTypeEnum('type').notNull(),
    qtyDelta: numeric('qty_delta', { precision: 12, scale: 2 }).notNull(),
    qtyBefore: numeric('qty_before', { precision: 12, scale: 2 }).notNull(),
    qtyAfter: numeric('qty_after', { precision: 12, scale: 2 }).notNull(),
    unitCost: money('unit_cost'),
    orderType: varchar('order_type', { length: 32 }),
    orderId: uuid('order_id'),
    refNo: varchar('ref_no', { length: 64 }),
    note: text('note'),
    operatorId: uuid('operator_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('stock_movements_unit_item_idx').on(table.unitId, table.itemId),
    index('stock_movements_batch_idx').on(table.batchId),
    index('stock_movements_created_idx').on(table.createdAt),
  ],
);

// ── 零售价 retail_prices + 历史 ───────────────────────────────────────────────

export const retailPrices = pgTable(
  'retail_prices',
  {
    id: pk(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => businessUnits.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    price: money('price').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('retail_prices_unit_item_unique').on(table.unitId, table.itemId),
    index('retail_prices_item_idx').on(table.itemId),
  ],
);

export const retailPriceHistory = pgTable(
  'retail_price_history',
  {
    id: pk(),
    unitId: uuid('unit_id').notNull(),
    itemId: uuid('item_id').notNull(),
    price: money('price').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('retail_price_history_unit_item_idx').on(table.unitId, table.itemId)],
);

// ── 仓库-零售签约 retail_partnerships────────────────────────
// 签约只能由仓库主动发起（把零售加入「可售客户」）；解约即删除行，无状态字段。

export const retailPartnerships = pgTable(
  'retail_partnerships',
  {
    id: pk(),
    warehouseUnitId: uuid('warehouse_unit_id')
      .notNull()
      .references(() => businessUnits.id, { onDelete: 'cascade' }),
    retailerUnitId: uuid('retailer_unit_id')
      .notNull()
      .references(() => businessUnits.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('retail_partnerships_pair_unique').on(table.warehouseUnitId, table.retailerUnitId),
    index('retail_partnerships_retailer_idx').on(table.retailerUnitId),
  ],
);

// ── 通知 notifications ────────────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    unitId: uuid('unit_id').references(() => businessUnits.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    content: text('content'),
    link: varchar('link', { length: 512 }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [
    check('notifications_target_check', sql`${table.userId} IS NOT NULL OR ${table.unitId} IS NOT NULL`),
    index('notifications_user_idx').on(table.userId),
    index('notifications_unit_idx').on(table.unitId),
  ],
);

// ── 审计日志 audit_logs ───────────────────────────────────────────────────────

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 128 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: varchar('ip', { length: 64 }),
    createdAt: createdAt(),
  },
  (table) => [
    index('audit_logs_user_idx').on(table.userId),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_idx').on(table.createdAt),
  ],
);

// ── 邮件日志 email_logs（可选追踪）────────────────────────────────────────────

export const emailLogs = pgTable(
  'email_logs',
  {
    id: pk(),
    toAddress: varchar('to_address', { length: 256 }).notNull(),
    subject: varchar('subject', { length: 512 }),
    /** 邮件正文（text 备查，不落敏感信息）。 */
    body: text('body'),
    status: emailLogStatusEnum('status').notNull().default('PENDING'),
    provider: varchar('provider', { length: 64 }),
    error: text('error'),
    /** 发送尝试次数（PENDING 重试后仍失败则记 2）。 */
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [index('email_logs_status_idx').on(table.status)],
);

// ── 表清单导出（供工具遍历 / 快照）────────────────────────────────────────────

export const schema = {
  businessUnits,
  users,
  items,
  itemImages,
  files,
  shipments,
  shipmentTrackings,
  shipmentItems,
  discrepancyReviews,
  discrepancyReviewItems,
  batches,
  inboundOrders,
  inboundOrderItems,
  outboundOrders,
  outboundOrderItems,
  returnOrders,
  returnOrderItems,
  salesOrders,
  salesOrderItems,
  salesBatchAllocations,
  payments,
  stock,
  stockMovements,
  retailPrices,
  retailPriceHistory,
  retailPartnerships,
  notifications,
  auditLogs,
  emailLogs,
};
