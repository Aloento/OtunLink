import { expiryRemainingDays } from '@otunlink/shared';
import type { SqlExecutor } from '@otunlink/db';

import type {
  ConfirmReceiptRepoInput,
  CreateFileInput,
  CreateInboundManualRepoInput,
  CreateItemInput,
  CreateOutboundRepoInput,
  CreateReturnRepoInput,
  CreateReviewInput,
  CreateShipmentInput,
  CreateUnitInput,
  CreateUserInput,
  DiscrepancyReviewItemRecord,
  DiscrepancyReviewRecord,
  FileRecord,
  InboundListQuery,
  InboundListResult,
  InboundOrderItemRecord,
  InboundOrderRecord,
  ItemImageRecord,
  ItemListQuery,
  ItemListResult,
  ItemRecord,
  NotificationRecord,
  NotificationRepository,
  OutboundListQuery,
  OutboundListResult,
  OutboundOrderItemRecord,
  OutboundOrderRecord,
  Repos,
  RetailPriceHistoryRecord,
  RetailPriceListQuery,
  RetailPriceRecord,
  RetailPriceRepository,
  ReturnListQuery,
  ReturnListResult,
  ReturnOrderItemRecord,
  ReturnOrderRecord,
  SaveCountResult,
  ShipmentCountRepoInput,
  ShipmentItemRecord,
  ShipmentListQuery,
  ShipmentListResult,
  ShipmentRecord,
  ShipmentTrackingRecord,
  StockBatchListQuery,
  StockBatchRecord,
  StockListQuery,
  StockListResult,
  StockMovementListQuery,
  StockMovementListResult,
  StockMovementRecord,
  StockRowRecord,
  UnitRecord,
  UpdateItemInput,
  UpdateShipmentInput,
  UpdateUnitInput,
  UpdateUserInput,
  UserRecord,
} from '../types';
import { mergeInboundLines, qtyEqual, type MergedInboundLine } from './inbound-lines';

// SQL 数据访问实现（stopgap）。
// 说明：生产最终应使用 Drizzle 查询构建（db.select().from(schema.users)...）走
// Hyperdrive/连接池；本实现受 ck-01 引入的 SqlExecutor（仅 query(sql)）抽象约束，
// 采用「单引号转义 + RETURNING」的参数化等价写法，注入方式与 Drizzle 相同
// （Repository 接口），后续可无痛替换为 Drizzle 实现。
// ck-02 期间 PG 不可达（见 docs/checkpoints/README.md ck-01 状态），此处仅做正确性兜底，
// 单测覆盖走内存实现。

const quote = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

const col = (name: string, value: unknown): string => `${name} = ${quote(value)}`;

/** uuid[] 列参数（PostgreSQL 数组字面量）。 */
const photoArray = (ids: string[]): string =>
  ids.length > 0 ? `ARRAY[${ids.map((id) => quote(id)).join(', ')}]::uuid[]` : `ARRAY[]::uuid[]`;

// 路由层据此把仓库层异常映射为 409 与对应错误码。
const SHIPMENT_STATE_CONFLICT = 'SHIPMENT_STATE_CONFLICT: only DRAFT shipments can be edited or sent';
const SHIPMENT_TRACKING_CONFLICT = 'TRACKING_CONFLICT: carrier+tracking_no already exists';
// ck-06：点货/差异协商业务信号（路由层映射为对应错误码）。
const COUNTING_STATE_CONFLICT =
  'COUNTING_STATE_CONFLICT: shipment is not in a countable state or version mismatch';
const COUNT_LINE_INVALID = 'COUNT_LINE_INVALID: count line does not belong to the shipment';
const REVIEW_ALREADY_PROCESSED =
  'REVIEW_ALREADY_PROCESSED: review already processed or pending review exists';
const REVIEW_NO_DIFFERENCE = 'REVIEW_NO_DIFFERENCE: no discrepancy to review';
// ck-07：确认入库 / 发货退货业务信号（路由层映射为对应错误码）。
const SHIPMENT_NOT_READY = 'SHIPMENT_NOT_READY: shipment is not READY or lines mismatch';
const INBOUND_STATE_CONFLICT = 'INBOUND_STATE_CONFLICT: only DRAFT inbound orders can be posted';
const RETURN_STATE_CONFLICT = 'RETURN_STATE_CONFLICT: shipment is not READY for return';
const RETURN_ALREADY_PROCESSED =
  'RETURN_ALREADY_PROCESSED: return order already processed';
const RETURN_LINE_INVALID = 'RETURN_LINE_INVALID: return line is invalid';
// ck-08a：手动出入库 / 库存台账业务信号（路由层映射为对应错误码）。
const OUTBOUND_STATE_CONFLICT =
  'OUTBOUND_STATE_CONFLICT: only DRAFT outbound orders can be posted';
const INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK: insufficient stock for outbound';
const STOCK_BATCH_NOT_FOUND =
  'STOCK_BATCH_NOT_FOUND: no stock of the specified batch in the warehouse';

function mapUser(row: Record<string, unknown>): UserRecord {
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

function mapUnit(row: Record<string, unknown>): UnitRecord {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    type: row.type as UnitRecord['type'],
    address: row.address ? String(row.address) : null,
    contact: row.contact ? String(row.contact) : null,
    timezone: String(row.timezone ?? 'UTC'),
    baseCurrency: String(row.base_currency ?? 'CNY'),
    isActive: row.is_active === true || row.is_active === 'true' || row.is_active === 't',
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapItem(row: Record<string, unknown>): ItemRecord {
  return {
    id: String(row.id),
    sku: row.sku ? String(row.sku) : null,
    name: String(row.name),
    barcode: row.barcode ? String(row.barcode) : null,
    specUnit: (row.spec_unit as ItemRecord['specUnit']) ?? 'PIECE',
    innerUnit: row.inner_unit ? (row.inner_unit as ItemRecord['innerUnit']) : null,
    innerCount: row.inner_count != null ? String(row.inner_count) : null,
    isPerishable: row.is_perishable === true || row.is_perishable === 'true' || row.is_perishable === 't',
    category: row.category ? String(row.category) : null,
    description: row.description ? String(row.description) : null,
    status: (row.status as ItemRecord['status']) ?? 'ACTIVE',
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapFile(row: Record<string, unknown>): FileRecord {
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

function mapShipment(row: Record<string, unknown>): ShipmentRecord {
  return {
    id: String(row.id),
    shipmentNo: String(row.shipment_no),
    shipperUnitId: String(row.shipper_unit_id),
    receiverUnitId: String(row.receiver_unit_id),
    status: (row.status as ShipmentRecord['status']) ?? 'DRAFT',
    boxesCount: Number(row.boxes_count ?? 0),
    currency: String(row.currency ?? 'CNY'),
    expectedArrivalDate: row.expected_arrival_date ? String(row.expected_arrival_date).slice(0, 10) : null,
    remark: row.remark ? String(row.remark) : null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    countVersion: Number(row.count_version ?? 0),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapShipmentTracking(row: Record<string, unknown>): ShipmentTrackingRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    carrier: String(row.carrier),
    trackingNo: String(row.tracking_no),
    note: row.note ? String(row.note) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

function mapShipmentItem(row: Record<string, unknown>): ShipmentItemRecord {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    itemId: row.item_id ? String(row.item_id) : null,
    name: String(row.name),
    spec: row.spec ? String(row.spec) : null,
    expectedQty: row.expected_qty != null ? String(row.expected_qty) : '0',
    actualQty: row.actual_qty != null ? String(row.actual_qty) : null,
    unitPrice: row.unit_price != null ? String(row.unit_price) : null,
    productionDate: row.production_date ? String(row.production_date).slice(0, 10) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : null,
    lineNote: row.line_note ? String(row.line_note) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapDiscrepancyReviewItem(row: Record<string, unknown>): DiscrepancyReviewItemRecord {
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

function mapDiscrepancyReview(row: Record<string, unknown>): DiscrepancyReviewRecord {
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

function mapInbound(row: Record<string, unknown>): InboundOrderRecord {
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

function mapInboundItem(row: Record<string, unknown>): InboundOrderItemRecord {
  return {
    id: String(row.id),
    inboundOrderId: String(row.inbound_order_id),
    itemId: String(row.item_id),
    batchId: row.batch_id ? String(row.batch_id) : null,
    qty: row.qty != null ? String(row.qty) : '0',
    unitCost: row.unit_cost != null ? String(row.unit_cost) : '0',
    lineNote: row.line_note ? String(row.line_note) : null,
    productionDate: row.production_date ? String(row.production_date).slice(0, 10) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : null,
    batchNo: row.batch_no ? String(row.batch_no) : null,
    createdAt: new Date(String(row.created_at)),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
  };
}

function mapReturn(row: Record<string, unknown>): ReturnOrderRecord {
  return {
    id: String(row.id),
    returnNo: String(row.return_no),
    sourceType: (row.source_type as ReturnOrderRecord['sourceType']) ?? 'SHIPMENT',
    shipmentId: row.shipment_id ? String(row.shipment_id) : null,
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

function mapReturnItem(row: Record<string, unknown>): ReturnOrderItemRecord {
  return {
    id: String(row.id),
    returnOrderId: String(row.return_order_id),
    itemId: String(row.item_id),
    shipmentItemId: row.shipment_item_id ? String(row.shipment_item_id) : null,
    qty: row.qty != null ? String(row.qty) : '0',
    originalBatchId: row.original_batch_id ? String(row.original_batch_id) : null,
    reason: row.reason ? String(row.reason) : null,
    createdAt: new Date(String(row.created_at)),
    itemName: row.item_name ? String(row.item_name) : null,
  };
}

function mapOutbound(row: Record<string, unknown>): OutboundOrderRecord {
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

function mapOutboundItem(row: Record<string, unknown>): OutboundOrderItemRecord {
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

function mapStockRow(row: Record<string, unknown>): StockRowRecord {
  return {
    unitId: String(row.unit_id),
    unitName: row.unit_name ? String(row.unit_name) : null,
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
    batchId: String(row.batch_id),
    batchNo: row.batch_no ? String(row.batch_no) : null,
    productionDate: row.production_date ? String(row.production_date).slice(0, 10) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : null,
    qty: row.qty != null ? String(row.qty) : '0',
    avgCost: row.avg_cost != null ? String(row.avg_cost) : '0',
    version: Number(row.version ?? 0),
    updatedAt: new Date(String(row.updated_at)),
  };
}

/** 在库存行上叠加效期计算字段（UTC 当日基准，与 shared 纯函数一致）。 */
function attachExpiry(row: StockRowRecord): StockBatchRecord {
  const remainingDays = expiryRemainingDays(row.expiryDate, new Date());
  return { ...row, remainingDays, isExpired: remainingDays !== null && remainingDays < 0 };
}

function mapStockMovement(row: Record<string, unknown>): StockMovementRecord {
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

function mapRetailPrice(row: Record<string, unknown>): RetailPriceRecord {
  return {
    id: String(row.id),
    unitId: String(row.unit_id),
    unitName: row.unit_name ? String(row.unit_name) : null,
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : null,
    spec: row.spec ? String(row.spec) : null,
    price: row.price != null ? String(row.price) : '0',
    currency: String(row.currency ?? 'CNY'),
    unitCost: row.unit_cost != null ? String(row.unit_cost) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedByName: row.updated_by_name ? String(row.updated_by_name) : null,
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapRetailPriceHistory(row: Record<string, unknown>): RetailPriceHistoryRecord {
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

function mapNotification(row: Record<string, unknown>): NotificationRecord {
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

/** IB-YYYYMMDD-XXXX（UTC 日期 + 4 位当日序号，唯一索引兜底顺延）。 */
async function nextInboundNo(exec: SqlExecutor): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `IB-${date}-`;
  const countResult = await exec.query(
    `SELECT count(*)::int AS n FROM inbound_orders WHERE inbound_no LIKE ${quote(`${prefix}%`)}`,
  );
  const base = Number(countResult.rows[0]?.n ?? 0) + 1;
  let no = `${prefix}${String(base).padStart(4, '0')}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const exists = await exec.query(
      `SELECT count(*)::int AS n FROM inbound_orders WHERE inbound_no = ${quote(no)}`,
    );
    if (Number(exists.rows[0]?.n ?? 0) === 0) break;
    no = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
  }
  return no;
}

/** RT-YYYYMMDD-XXXX（UTC 日期 + 4 位当日序号，唯一索引兜底顺延）。 */
async function nextReturnNo(exec: SqlExecutor): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `RT-${date}-`;
  const countResult = await exec.query(
    `SELECT count(*)::int AS n FROM return_orders WHERE return_no LIKE ${quote(`${prefix}%`)}`,
  );
  const base = Number(countResult.rows[0]?.n ?? 0) + 1;
  let no = `${prefix}${String(base).padStart(4, '0')}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const exists = await exec.query(
      `SELECT count(*)::int AS n FROM return_orders WHERE return_no = ${quote(no)}`,
    );
    if (Number(exists.rows[0]?.n ?? 0) === 0) break;
    no = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
  }
  return no;
}

/** OB-YYYYMMDD-XXXX（UTC 日期 + 4 位当日序号，唯一索引兜底顺延）。 */
async function nextOutboundNo(exec: SqlExecutor): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `OB-${date}-`;
  const countResult = await exec.query(
    `SELECT count(*)::int AS n FROM outbound_orders WHERE outbound_no LIKE ${quote(`${prefix}%`)}`,
  );
  const base = Number(countResult.rows[0]?.n ?? 0) + 1;
  let no = `${prefix}${String(base).padStart(4, '0')}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const exists = await exec.query(
      `SELECT count(*)::int AS n FROM outbound_orders WHERE outbound_no = ${quote(no)}`,
    );
    if (Number(exists.rows[0]?.n ?? 0) === 0) break;
    no = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
  }
  return no;
}

export function createSqlRepos(exec: SqlExecutor): Repos {
  const users = {
    async findByEntraSub(sub: string): Promise<UserRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM users WHERE entra_sub = ${quote(sub)} LIMIT 1`);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async findById(id: string): Promise<UserRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM users WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async list(): Promise<UserRecord[]> {
      const { rows } = await exec.query('SELECT * FROM users ORDER BY created_at ASC');
      return rows.map(mapUser);
    },
    async create(input: CreateUserInput): Promise<UserRecord> {
      const { rows } = await exec.query(
        `INSERT INTO users (entra_sub, email, name, role, scope_unit_id, status, locale)
         VALUES (${quote(input.entraSub)}, ${quote(input.email)}, ${quote(input.name)},
                 ${quote(input.role ?? null)}, ${quote(input.scopeUnitId ?? null)},
                 ${quote(input.status ?? 'PENDING')}, ${quote(input.locale ?? 'zh-CN')})
         RETURNING *`,
      );
      return mapUser(rows[0]);
    },
    async update(id: string, patch: UpdateUserInput): Promise<UserRecord | null> {
      const sets: string[] = [];
      if (patch.name !== undefined) sets.push(col('name', patch.name));
      if (patch.role !== undefined) sets.push(col('role', patch.role));
      if (patch.scopeUnitId !== undefined) sets.push(col('scope_unit_id', patch.scopeUnitId));
      if (patch.status !== undefined) sets.push(col('status', patch.status));
      if (patch.locale !== undefined) sets.push(col('locale', patch.locale));
      if (sets.length === 0) {
        const existing = await this.findById(id);
        return existing;
      }
      sets.push('updated_at = now()');
      const { rows } = await exec.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
      );
      return rows[0] ? mapUser(rows[0]) : null;
    },
  };

  const units = {
    async findById(id: string): Promise<UnitRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM business_units WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapUnit(rows[0]) : null;
    },
    async list(opts: { includeInactive?: boolean; scopeUnitId?: string } = {}): Promise<UnitRecord[]> {
      const where: string[] = [];
      if (!opts.includeInactive) where.push('is_active = TRUE');
      if (opts.scopeUnitId) where.push(`id = ${quote(opts.scopeUnitId)}`);
      const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const { rows } = await exec.query(`SELECT * FROM business_units${clause} ORDER BY code ASC`);
      return rows.map(mapUnit);
    },
    async create(input: CreateUnitInput): Promise<UnitRecord> {
      const { rows } = await exec.query(
        `INSERT INTO business_units (code, name, type, address, contact, timezone, base_currency, is_active)
         VALUES (${quote(input.code)}, ${quote(input.name)}, ${quote(input.type)},
                 ${quote(input.address ?? null)}, ${quote(input.contact ?? null)},
                 ${quote(input.timezone ?? 'UTC')}, ${quote(input.baseCurrency ?? 'CNY')},
                 ${quote(input.isActive ?? true)})
         RETURNING *`,
      );
      return mapUnit(rows[0]);
    },
    async update(id: string, patch: UpdateUnitInput): Promise<UnitRecord | null> {
      const sets: string[] = [];
      if (patch.code !== undefined) sets.push(col('code', patch.code));
      if (patch.name !== undefined) sets.push(col('name', patch.name));
      if (patch.type !== undefined) sets.push(col('type', patch.type));
      if (patch.address !== undefined) sets.push(col('address', patch.address));
      if (patch.contact !== undefined) sets.push(col('contact', patch.contact));
      if (patch.timezone !== undefined) sets.push(col('timezone', patch.timezone));
      if (patch.baseCurrency !== undefined) sets.push(col('base_currency', patch.baseCurrency));
      if (patch.isActive !== undefined) sets.push(col('is_active', patch.isActive));
      if (sets.length === 0) {
        const existing = await this.findById(id);
        return existing;
      }
      sets.push('updated_at = now()');
      const { rows } = await exec.query(
        `UPDATE business_units SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
      );
      return rows[0] ? mapUnit(rows[0]) : null;
    },
  };

  const items = {
    async findById(id: string): Promise<ItemRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM items WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapItem(rows[0]) : null;
    },
    async findByBarcode(code: string): Promise<ItemRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM items WHERE status = 'ACTIVE' AND barcode = ${quote(code.trim())} LIMIT 1`,
      );
      return rows[0] ? mapItem(rows[0]) : null;
    },
    async list(query: ItemListQuery): Promise<ItemListResult> {
      const where: string[] = [];
      if (query.q) {
        const q = query.q.trim();
        where.push(
          `(name ILIKE ${quote(`%${q}%`)} OR barcode ILIKE ${quote(`%${q}%`)} OR sku ILIKE ${quote(`%${q}%`)})`,
        );
      }
      const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const size = Math.min(Math.max(query.size ?? 50, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(`SELECT count(*)::int AS n FROM items${clause}`);
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT * FROM items${clause} ORDER BY created_at DESC, name ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapItem), total, page, size };
    },
    async create(input: CreateItemInput): Promise<ItemRecord> {
      const { rows } = await exec.query(
        `INSERT INTO items
           (sku, name, barcode, spec_unit, inner_unit, inner_count, is_perishable,
            category, description, status, created_by)
         VALUES (${quote(nn(input.sku))}, ${quote(input.name)}, ${quote(nn(input.barcode))},
                 ${quote(input.specUnit ?? 'PIECE')}, ${quote(input.innerUnit ?? null)},
                 ${quote(input.innerCount ?? null)}, ${quote(input.isPerishable ?? false)},
                 ${quote(nn(input.category))}, ${quote(nn(input.description))},
                 ${quote(input.status ?? 'ACTIVE')}, ${quote(input.createdBy)})
         RETURNING *`,
      );
      return mapItem(rows[0]);
    },
    async update(id: string, patch: UpdateItemInput): Promise<ItemRecord | null> {
      const sets: string[] = [];
      if (patch.sku !== undefined) sets.push(col('sku', patch.sku));
      if (patch.name !== undefined) sets.push(col('name', patch.name));
      if (patch.barcode !== undefined) sets.push(col('barcode', patch.barcode));
      if (patch.specUnit !== undefined) sets.push(col('spec_unit', patch.specUnit));
      if (patch.innerUnit !== undefined) sets.push(col('inner_unit', patch.innerUnit));
      if (patch.innerCount !== undefined) sets.push(col('inner_count', patch.innerCount));
      if (patch.isPerishable !== undefined) sets.push(col('is_perishable', patch.isPerishable));
      if (patch.category !== undefined) sets.push(col('category', patch.category));
      if (patch.description !== undefined) sets.push(col('description', patch.description));
      if (patch.status !== undefined) sets.push(col('status', patch.status));
      if (sets.length === 0) {
        const existing = await this.findById(id);
        return existing;
      }
      sets.push('updated_at = now()');
      const { rows } = await exec.query(
        `UPDATE items SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
      );
      return rows[0] ? mapItem(rows[0]) : null;
    },
    async listImages(itemId: string): Promise<ItemImageRecord[]> {
      const { rows } = await exec.query(
        `SELECT ii.*, f.* FROM item_images ii
           LEFT JOIN files f ON f.id = ii.file_id
         WHERE ii.item_id = ${quote(itemId)}
         ORDER BY ii.sort_order ASC, ii.created_at ASC`,
      );
      return rows.map((row) => ({
        id: String(row.id),
        itemId: String(row.item_id),
        fileId: String(row.file_id),
        isPrimary: row.is_primary === true || row.is_primary === 'true' || row.is_primary === 't',
        sortOrder: Number(row.sort_order),
        createdAt: new Date(String(row.created_at)),
        file: row.key ? mapFile(row) : undefined,
      }));
    },
    async attachImages(itemId: string, fileIds: string[]): Promise<ItemImageRecord[]> {
      const existing = await this.listImages(itemId);
      let order = existing.reduce((max, img) => Math.max(max, img.sortOrder), 0);
      for (const fileId of fileIds) {
        order += 1;
        const isPrimary = existing.length === 0 && order === 1;
        await exec.query(
          `INSERT INTO item_images (item_id, file_id, is_primary, sort_order)
           VALUES (${quote(itemId)}, ${quote(fileId)}, ${quote(isPrimary)}, ${quote(order)})`,
        );
      }
      return this.listImages(itemId);
    },
  };

  const files = {
    async findById(id: string): Promise<FileRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM files WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapFile(rows[0]) : null;
    },
    async create(input: CreateFileInput): Promise<FileRecord> {
      const { rows } = await exec.query(
        `INSERT INTO files (key, thumbnail_key, mime, size, width, height)
         VALUES (${quote(input.key)}, ${quote(input.thumbnailKey)}, ${quote(input.mime)},
                 ${quote(input.size)}, ${quote(input.width)}, ${quote(input.height)})
         RETURNING *`,
      );
      return mapFile(rows[0]);
    },
  };

  // 物流单号唯一索引冲突翻译：把 PG 约束错误归一为业务错误码。
  function translateTrackingError(err: unknown, message: string): never {
    const text = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique|23505/i.test(text)) throw new Error(SHIPMENT_TRACKING_CONFLICT);
    throw new Error(message);
  }

  const shipments = {
    async findById(id: string): Promise<ShipmentRecord | null> {
      const { rows } = await exec.query(`SELECT * FROM shipments WHERE id = ${quote(id)} LIMIT 1`);
      return rows[0] ? mapShipment(rows[0]) : null;
    },
    async findByNo(no: string): Promise<ShipmentRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM shipments WHERE shipment_no = ${quote(no)} LIMIT 1`,
      );
      return rows[0] ? mapShipment(rows[0]) : null;
    },
    async list(query: ShipmentListQuery): Promise<ShipmentListResult> {
      const where: string[] = [];
      if (query.status) where.push(`status = ${quote(query.status)}`);
      if (query.scopeUnitId) {
        where.push(
          `(shipper_unit_id = ${quote(query.scopeUnitId)} OR receiver_unit_id = ${quote(query.scopeUnitId)})`,
        );
      }
      const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(`SELECT count(*)::int AS n FROM shipments${clause}`);
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT * FROM shipments${clause} ORDER BY created_at DESC, id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapShipment), total, page, size };
    },
    async create(input: CreateShipmentInput): Promise<ShipmentRecord> {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `SH-${date}-`;
      const countResult = await exec.query(
        `SELECT count(*)::int AS n FROM shipments WHERE shipment_no LIKE ${quote(`${prefix}%`)}`,
      );
      const base = Number(countResult.rows[0]?.n ?? 0) + 1;
      let shipmentNo = `${prefix}${String(base).padStart(4, '0')}`;
      // 唯一索引兜底：并发/重跑时顺延序号。
      for (let attempt = 0; attempt < 50; attempt++) {
        const exists = await exec.query(
          `SELECT count(*)::int AS n FROM shipments WHERE shipment_no = ${quote(shipmentNo)}`,
        );
        if (Number(exists.rows[0]?.n ?? 0) === 0) break;
        shipmentNo = `${prefix}${String(base + attempt + 1).padStart(4, '0')}`;
      }

      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO shipments
             (shipment_no, shipper_unit_id, receiver_unit_id, status, boxes_count,
              currency, expected_arrival_date, remark, created_by)
           VALUES (${quote(shipmentNo)}, ${quote(input.shipperUnitId)}, ${quote(input.receiverUnitId)},
                   'DRAFT', ${quote(input.boxesCount)}, ${quote(input.currency ?? 'CNY')},
                   ${quote(nn(input.expectedArrivalDate))}, ${quote(nn(input.remark))},
                   ${quote(input.createdBy)})
           RETURNING *`,
        );
        const shipment = mapShipment(rows[0]);
        for (const t of input.trackings) {
          try {
            await exec.query(
              `INSERT INTO shipment_trackings (shipment_id, carrier, tracking_no, note)
               VALUES (${quote(shipment.id)}, ${quote(t.carrier)}, ${quote(t.trackingNo)},
                       ${quote(nn(t.note))})`,
            );
          } catch (err) {
            translateTrackingError(err, String(err));
          }
        }
        for (const i of input.items) {
          await exec.query(
            `INSERT INTO shipment_items
               (shipment_id, item_id, name, spec, expected_qty, unit_price,
                production_date, expiry_date, line_note)
             VALUES (${quote(shipment.id)}, ${quote(i.itemId)}, ${quote(i.name)},
                     ${quote(nn(i.spec))}, ${quote(i.expectedQty)}, ${quote(nn(i.unitPrice))},
                     ${quote(nn(i.productionDate))}, ${quote(nn(i.expiryDate))},
                     ${quote(nn(i.lineNote))})`,
          );
        }
        await exec.query('COMMIT');
        return shipment;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async update(id: string, patch: UpdateShipmentInput): Promise<ShipmentRecord | null> {
      const existing = await this.findById(id);
      if (!existing) return null;
      if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_CONFLICT);

      const sets: string[] = [];
      if (patch.shipperUnitId !== undefined) sets.push(col('shipper_unit_id', patch.shipperUnitId));
      if (patch.receiverUnitId !== undefined) sets.push(col('receiver_unit_id', patch.receiverUnitId));
      if (patch.boxesCount !== undefined) sets.push(col('boxes_count', patch.boxesCount));
      if (patch.currency !== undefined) sets.push(col('currency', patch.currency));
      if (patch.expectedArrivalDate !== undefined) sets.push(col('expected_arrival_date', nn(patch.expectedArrivalDate)));
      if (patch.remark !== undefined) sets.push(col('remark', nn(patch.remark)));
      if (sets.length === 0) return existing;
      sets.push('updated_at = now()');

      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `UPDATE shipments SET ${sets.join(', ')} WHERE id = ${quote(id)} RETURNING *`,
        );
        if (patch.trackings) {
          await exec.query(`DELETE FROM shipment_trackings WHERE shipment_id = ${quote(id)}`);
          for (const t of patch.trackings) {
            try {
              await exec.query(
                `INSERT INTO shipment_trackings (shipment_id, carrier, tracking_no, note)
                 VALUES (${quote(id)}, ${quote(t.carrier)}, ${quote(t.trackingNo)}, ${quote(nn(t.note))})`,
              );
            } catch (err) {
              translateTrackingError(err, String(err));
            }
          }
        }
        if (patch.items) {
          await exec.query(`DELETE FROM shipment_items WHERE shipment_id = ${quote(id)}`);
          for (const i of patch.items) {
            await exec.query(
              `INSERT INTO shipment_items
                 (shipment_id, item_id, name, spec, expected_qty, unit_price,
                  production_date, expiry_date, line_note)
               VALUES (${quote(id)}, ${quote(i.itemId)}, ${quote(i.name)},
                       ${quote(nn(i.spec))}, ${quote(i.expectedQty)}, ${quote(nn(i.unitPrice))},
                       ${quote(nn(i.productionDate))}, ${quote(nn(i.expiryDate))},
                       ${quote(nn(i.lineNote))})`,
            );
          }
        }
        await exec.query('COMMIT');
        return rows[0] ? mapShipment(rows[0]) : null;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async send(id: string): Promise<ShipmentRecord | null> {
      const existing = await this.findById(id);
      if (!existing) return null;
      if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_CONFLICT);
      const { rows } = await exec.query(
        `UPDATE shipments SET status = 'SENT', sent_at = now(), updated_at = now()
         WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING *`,
      );
      return rows[0] ? mapShipment(rows[0]) : null;
    },
    async listTrackings(shipmentId: string): Promise<ShipmentTrackingRecord[]> {
      const { rows } = await exec.query(
        `SELECT * FROM shipment_trackings WHERE shipment_id = ${quote(shipmentId)} ORDER BY created_at ASC, id ASC`,
      );
      return rows.map(mapShipmentTracking);
    },
    async listTrackingsForShipments(ids: string[]): Promise<Map<string, ShipmentTrackingRecord[]>> {
      const map = new Map<string, ShipmentTrackingRecord[]>();
      for (const id of ids) map.set(id, []);
      if (ids.length === 0) return map;
      const inList = ids.map((id) => quote(id)).join(', ');
      const { rows } = await exec.query(
        `SELECT * FROM shipment_trackings WHERE shipment_id IN (${inList}) ORDER BY created_at ASC, id ASC`,
      );
      for (const row of rows) {
        const tracking = mapShipmentTracking(row);
        map.get(tracking.shipmentId)?.push(tracking);
      }
      return map;
    },
    async listItems(shipmentId: string): Promise<ShipmentItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT * FROM shipment_items WHERE shipment_id = ${quote(shipmentId)} ORDER BY created_at ASC, id ASC`,
      );
      return rows.map(mapShipmentItem);
    },
    // ── 收货点货与差异协商（ck-06）─────────────────────────────────────────────
    async startCounting(id: string): Promise<ShipmentRecord | null> {
      const { rows } = await exec.query(
        `UPDATE shipments SET status = 'COUNTING', updated_at = now()
         WHERE id = ${quote(id)} AND status = 'SENT' RETURNING *`,
      );
      if (rows[0]) return mapShipment(rows[0]);
      const existing = await this.findById(id);
      if (!existing) return null;
      throw new Error(COUNTING_STATE_CONFLICT);
    },
    async saveCount(id: string, input: ShipmentCountRepoInput): Promise<SaveCountResult | null> {
      const existing = await this.findById(id);
      if (!existing) return null;

      const { rows: lineRows } = await exec.query(
        `SELECT id FROM shipment_items WHERE shipment_id = ${quote(id)}`,
      );
      const validIds = new Set(lineRows.map((r) => String(r.id)));
      for (const line of input.lines) {
        if (!validIds.has(line.shipmentItemId)) throw new Error(COUNT_LINE_INVALID);
      }

      await exec.query('BEGIN');
      try {
        // CAS：状态可点货且版本一致才递增版本号，防止并发保存互相覆盖。
        const { rows: locked } = await exec.query(
          `UPDATE shipments SET count_version = count_version + 1, updated_at = now()
           WHERE id = ${quote(id)} AND status IN ('COUNTING', 'DISCREPANCY')
             AND count_version = ${quote(input.version)}
           RETURNING *`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          throw new Error(COUNTING_STATE_CONFLICT);
        }
        for (const line of input.lines) {
          await exec.query(
            `UPDATE shipment_items
             SET actual_qty = ${quote(line.actualQty === '' ? null : line.actualQty)}, updated_at = now()
             WHERE id = ${quote(line.shipmentItemId)}`,
          );
        }
        // 重算：存在差异 → DISCREPANCY；全部一致 → READY；仍有未点 → COUNTING。
        const { rows: allRows } = await exec.query(
          `SELECT expected_qty, actual_qty FROM shipment_items
           WHERE shipment_id = ${quote(id)} ORDER BY created_at ASC, id ASC`,
        );
        let hasDifference = false;
        let allCounted = true;
        for (const row of allRows) {
          const actual = row.actual_qty;
          if (actual === null || actual === undefined || String(actual).trim() === '') {
            allCounted = false;
          } else if (Number(String(actual)) !== Number(String(row.expected_qty))) {
            hasDifference = true;
          }
        }
        const status = hasDifference ? 'DISCREPANCY' : allCounted ? 'READY' : 'COUNTING';
        const { rows: updated } = await exec.query(
          `UPDATE shipments SET status = ${quote(status)} WHERE id = ${quote(id)} RETURNING *`,
        );
        await exec.query('COMMIT');
        const shipment = mapShipment(updated[0]);
        return { shipment, countVersion: shipment.countVersion };
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async listReviews(shipmentId: string): Promise<DiscrepancyReviewRecord[]> {
      const { rows } = await exec.query(
        `SELECT * FROM discrepancy_reviews WHERE shipment_id = ${quote(shipmentId)}
         ORDER BY created_at DESC, id DESC`,
      );
      const reviews = rows.map(mapDiscrepancyReview);
      for (const review of reviews) {
        const { rows: itemRows } = await exec.query(
          `SELECT * FROM discrepancy_review_items WHERE review_id = ${quote(review.id)} ORDER BY id ASC`,
        );
        review.items = itemRows.map(mapDiscrepancyReviewItem);
      }
      return reviews;
    },
    async findReview(id: string): Promise<DiscrepancyReviewRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM discrepancy_reviews WHERE id = ${quote(id)} LIMIT 1`,
      );
      if (!rows[0]) return null;
      const review = mapDiscrepancyReview(rows[0]);
      const { rows: itemRows } = await exec.query(
        `SELECT * FROM discrepancy_review_items WHERE review_id = ${quote(id)} ORDER BY id ASC`,
      );
      review.items = itemRows.map(mapDiscrepancyReviewItem);
      return review;
    },
    async createReview(input: CreateReviewInput): Promise<DiscrepancyReviewRecord> {
      const shipment = await this.findById(input.shipmentId);
      if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');

      if (shipment.status !== 'DISCREPANCY') {
        const { rows } = await exec.query(
          `SELECT count(*)::int AS n FROM discrepancy_reviews
           WHERE shipment_id = ${quote(input.shipmentId)} AND status = 'PENDING'`,
        );
        if (Number(rows[0]?.n ?? 0) > 0) throw new Error(REVIEW_ALREADY_PROCESSED);
        throw new Error(REVIEW_NO_DIFFERENCE);
      }

      const shipmentItems = await this.listItems(input.shipmentId);
      const byId = new Map(shipmentItems.map((it) => [it.id, it]));
      let hasDifference = false;
      for (const line of input.lines) {
        const item = byId.get(line.shipmentItemId);
        if (!item) throw new Error(COUNT_LINE_INVALID);
        if (
          item.actualQty === null ||
          item.actualQty === '' ||
          Number(item.actualQty) === Number(item.expectedQty)
        ) {
          throw new Error(REVIEW_NO_DIFFERENCE);
        }
        hasDifference = true;
      }
      if (!hasDifference) throw new Error(REVIEW_NO_DIFFERENCE);

      await exec.query('BEGIN');
      try {
        let reviewId = '';
        try {
          const { rows } = await exec.query(
            `INSERT INTO discrepancy_reviews
               (shipment_id, status, reason, photo_file_ids, submitted_by)
             VALUES (${quote(input.shipmentId)}, 'PENDING', ${quote(nn(input.reason))},
                     ${photoArray(input.photoFileIds)}, ${quote(input.submittedBy)})
             RETURNING id`,
          );
          reviewId = String(rows[0].id);
        } catch (err) {
          const text = err instanceof Error ? err.message : String(err);
          if (/duplicate|unique|23505/i.test(text)) throw new Error(REVIEW_ALREADY_PROCESSED);
          throw err;
        }
        for (const line of input.lines) {
          const item = byId.get(line.shipmentItemId)!;
          await exec.query(
            `INSERT INTO discrepancy_review_items
               (review_id, shipment_item_id, expected_qty_before, actual_qty, reason)
             VALUES (${quote(reviewId)}, ${quote(line.shipmentItemId)}, ${quote(item.expectedQty)},
                     ${quote(line.actualQty)}, ${quote(nn(line.reason))})`,
          );
        }
        await exec.query(
          `UPDATE shipments SET status = 'REVIEW_PENDING', updated_at = now()
           WHERE id = ${quote(input.shipmentId)}`,
        );
        await exec.query('COMMIT');
        const review = await this.findReview(reviewId);
        if (!review) throw new Error('SHIPMENT_NOT_FOUND: review disappeared');
        return review;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async approveReview(
      id: string,
      reviewedBy: string | null,
    ): Promise<DiscrepancyReviewRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: reviewRows } = await exec.query(
          `SELECT * FROM discrepancy_reviews WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!reviewRows[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const review = mapDiscrepancyReview(reviewRows[0]);
        if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED);

        const { rows: itemRows } = await exec.query(
          `SELECT * FROM discrepancy_review_items WHERE review_id = ${quote(id)} ORDER BY id ASC`,
        );
        const items = itemRows.map(mapDiscrepancyReviewItem);
        const before: Record<string, string> = {};
        for (const item of items) {
          const current = await exec.query(
            `SELECT expected_qty FROM shipment_items WHERE id = ${quote(item.shipmentItemId)}`,
          );
          before[item.shipmentItemId] = String(current.rows[0]?.expected_qty ?? item.expectedQtyBefore);
          await exec.query(
            `UPDATE shipment_items SET expected_qty = ${quote(item.actualQty)}, updated_at = now()
             WHERE id = ${quote(item.shipmentItemId)}`,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE discrepancy_reviews
           SET status = 'APPROVED', reviewed_by = ${quote(reviewedBy)}, reviewed_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(REVIEW_ALREADY_PROCESSED);
        await exec.query(
          `UPDATE shipments SET status = 'READY', updated_at = now()
           WHERE id = ${quote(review.shipmentId)}`,
        );
        if (reviewedBy) {
          await exec.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before, after)
             VALUES (${quote(reviewedBy)}, 'REVIEW_APPROVED', 'discrepancy_review', ${quote(id)},
                     ${quote(JSON.stringify(before))},
                     ${quote(
                       JSON.stringify({
                         items: items.map((i) => ({
                           shipmentItemId: i.shipmentItemId,
                           expectedQtyBefore: i.expectedQtyBefore,
                           actualQty: i.actualQty,
                         })),
                       }),
                     )})`,
          );
        }
        await exec.query('COMMIT');
        return this.findReview(id);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async rejectReview(
      id: string,
      reviewedBy: string | null,
      reason: string,
    ): Promise<DiscrepancyReviewRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: reviewRows } = await exec.query(
          `SELECT * FROM discrepancy_reviews WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!reviewRows[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const review = mapDiscrepancyReview(reviewRows[0]);
        if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED);

        const { rows: updated } = await exec.query(
          `UPDATE discrepancy_reviews
           SET status = 'REJECTED', reason = ${quote(reason)}, reviewed_by = ${quote(reviewedBy)},
               reviewed_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(REVIEW_ALREADY_PROCESSED);
        await exec.query(
          `UPDATE shipments SET status = 'DISCREPANCY', updated_at = now()
           WHERE id = ${quote(review.shipmentId)}`,
        );
        await exec.query('COMMIT');
        return this.findReview(id);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };

  // ── 确认入库与发货退货（ck-07）───────────────────────────────────────────────
  // 入库单 / 退货单复用同一 SqlExecutor；确认收货与退货接受跨表事务在此实现。

  /** 在事务内插入 DRAFT 入库单 + 明细；返回入库单记录（调用方负责 COMMIT/ROLLBACK）。 */
  async function insertDraftInbound(params: {
    inboundNo: string;
    shipmentId: string | null;
    warehouseUnitId: string;
    counterpartyUnitId: string | null;
    remark: string | null;
    photoFileIds: string[];
    createdBy: string | null;
    lines: MergedInboundLine[];
  }): Promise<InboundOrderRecord> {
    const { rows } = await exec.query(
      `INSERT INTO inbound_orders
         (inbound_no, source_type, shipment_id, warehouse_unit_id, counterparty_unit_id,
          status, remark, photo_file_ids, created_by)
       VALUES (${quote(params.inboundNo)}, 'SHIPMENT', ${quote(params.shipmentId)},
              ${quote(params.warehouseUnitId)}, ${quote(params.counterpartyUnitId)},
              'DRAFT', ${quote(nn(params.remark))}, ${photoArray(params.photoFileIds)},
              ${quote(params.createdBy)})
       RETURNING *`,
    );
    const inbound = mapInbound(rows[0]);
    for (const line of params.lines) {
      await exec.query(
        `INSERT INTO inbound_order_items
           (inbound_order_id, item_id, qty, unit_cost, production_date, expiry_date, batch_no)
         VALUES (${quote(inbound.id)}, ${quote(line.itemId)}, ${quote(line.qty)},
                ${quote(line.unitCost)}, ${quote(nn(line.productionDate))},
                ${quote(nn(line.expiryDate))}, ${quote(nn(line.batchNo))})`,
      );
    }
    return inbound;
  }

  /** 写入批次 → 库存（加权平均）→ 台账；调用方负责事务。 */
  async function postInboundLine(
    inbound: InboundOrderRecord,
    line: InboundOrderItemRecord,
    operatorId: string | null,
    opts?: { movementType?: string; sourceOrderId?: string | null },
  ): Promise<string> {
    const movementType = opts?.movementType ?? 'INBOUND_SHIPMENT';
    const sourceOrderId = opts?.sourceOrderId ?? inbound.shipmentId;
    const { rows: batchRows } = await exec.query(
      `INSERT INTO batches
         (item_id, batch_no, production_date, expiry_date, source_type, source_order_id, created_by)
       VALUES (${quote(line.itemId)}, ${quote(nn(line.batchNo))}, ${quote(nn(line.productionDate))},
              ${quote(nn(line.expiryDate))}, ${quote(inbound.sourceType)},
              ${quote(sourceOrderId)}, ${quote(operatorId)})
       RETURNING id`,
    );
    const batchId = String(batchRows[0].id);
    await exec.query(
      `UPDATE inbound_order_items SET batch_id = ${quote(batchId)} WHERE id = ${quote(line.id)}`,
    );

    const inQty = Number(line.qty);
    const inCost = Number(line.unitCost);
    const { rows: stockRows } = await exec.query(
      `SELECT qty, avg_cost FROM stock
        WHERE unit_id = ${quote(inbound.warehouseUnitId)}
          AND item_id = ${quote(line.itemId)}
          AND batch_id = ${quote(batchId)}
        FOR UPDATE`,
    );
    const qtyBefore = stockRows[0] ? Number(String(stockRows[0].qty ?? '0')) : 0;
    const qtyAfter = qtyBefore + inQty;
    if (stockRows[0]) {
      const oldAvg = Number(String(stockRows[0].avg_cost ?? '0'));
      const newAvg = qtyAfter > 0 ? (qtyBefore * oldAvg + inQty * inCost) / qtyAfter : 0;
      await exec.query(
        `UPDATE stock SET qty = ${quote(qtyAfter.toFixed(2))}, avg_cost = ${quote(newAvg.toFixed(2))},
           version = version + 1, updated_at = now()
         WHERE unit_id = ${quote(inbound.warehouseUnitId)}
           AND item_id = ${quote(line.itemId)}
           AND batch_id = ${quote(batchId)}`,
      );
    } else {
      await exec.query(
        `INSERT INTO stock (unit_id, item_id, batch_id, qty, avg_cost, version)
         VALUES (${quote(inbound.warehouseUnitId)}, ${quote(line.itemId)}, ${quote(batchId)},
                ${quote(qtyAfter.toFixed(2))}, ${quote(line.unitCost)}, 1)`,
      );
    }
    await exec.query(
      `INSERT INTO stock_movements
         (unit_id, item_id, batch_id, type, qty_delta, qty_before, qty_after, unit_cost,
          order_type, order_id, ref_no, operator_id)
       VALUES (${quote(inbound.warehouseUnitId)}, ${quote(line.itemId)}, ${quote(batchId)},
              ${quote(movementType)}, ${quote(inQty.toFixed(2))}, ${quote(qtyBefore.toFixed(2))},
              ${quote(qtyAfter.toFixed(2))}, ${quote(line.unitCost)}, 'inbound',
              ${quote(inbound.id)}, ${quote(inbound.inboundNo)}, ${quote(operatorId)})`,
    );
    return batchId;
  }

  const inbounds = {
    async list(query: InboundListQuery): Promise<InboundListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.status) parts.push(`${alias}status = ${quote(query.status)}`);
        if (query.warehouseUnitId) parts.push(`${alias}warehouse_unit_id = ${quote(query.warehouseUnitId)}`);
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM inbound_orders${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT io.*, bu.name AS warehouse_name, cp.name AS counterparty_name, s.shipment_no
         FROM inbound_orders io
         LEFT JOIN business_units bu ON bu.id = io.warehouse_unit_id
         LEFT JOIN business_units cp ON cp.id = io.counterparty_unit_id
         LEFT JOIN shipments s ON s.id = io.shipment_id
         ${where('io.')} ORDER BY io.created_at DESC, io.id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapInbound), total, page, size };
    },
    async findById(id: string): Promise<InboundOrderRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM inbound_orders WHERE id = ${quote(id)} LIMIT 1`,
      );
      return rows[0] ? mapInbound(rows[0]) : null;
    },
    async listItems(inboundOrderId: string): Promise<InboundOrderItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT ioi.*, i.name AS item_name, i.spec_unit AS spec
         FROM inbound_order_items ioi
         LEFT JOIN items i ON i.id = ioi.item_id
         WHERE ioi.inbound_order_id = ${quote(inboundOrderId)}
         ORDER BY ioi.created_at ASC, ioi.id ASC`,
      );
      return rows.map(mapInboundItem);
    },
    async createManual(input: CreateInboundManualRepoInput): Promise<InboundOrderRecord> {
      const inboundNo = await nextInboundNo(exec);
      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO inbound_orders
             (inbound_no, source_type, shipment_id, warehouse_unit_id, counterparty_unit_id,
              status, remark, photo_file_ids, created_by)
           VALUES (${quote(inboundNo)}, 'MANUAL', NULL,
                  ${quote(input.warehouseUnitId)}, ${quote(input.counterpartyUnitId)},
                  'DRAFT', ${quote(nn(input.remark))}, ${photoArray(input.photoFileIds)},
                  ${quote(input.createdBy)})
           RETURNING *`,
        );
        const inbound = mapInbound(rows[0]);
        for (const line of input.lines) {
          await exec.query(
            `INSERT INTO inbound_order_items
               (inbound_order_id, item_id, qty, unit_cost, production_date, expiry_date, batch_no, line_note)
             VALUES (${quote(inbound.id)}, ${quote(line.itemId)}, ${quote(line.qty)},
                    ${quote(line.unitCost)}, ${quote(nn(line.productionDate))},
                    ${quote(nn(line.expiryDate))}, ${quote(nn(line.batchNo))},
                    ${quote(nn(line.lineNote ?? null))})`,
          );
        }
        await exec.query('COMMIT');
        return inbound;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async confirmReceipt(
      shipmentId: string,
      input: ConfirmReceiptRepoInput,
    ): Promise<InboundOrderRecord> {
      const shipment = await shipments.findById(shipmentId);
      if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
      if (shipment.status !== 'READY') throw new Error(SHIPMENT_NOT_READY);

      const shipmentItems = await shipments.listItems(shipmentId);
      if (shipmentItems.length === 0) throw new Error(SHIPMENT_NOT_READY);
      for (const item of shipmentItems) {
        if (!item.itemId) throw new Error(SHIPMENT_NOT_READY);
        if (item.actualQty === null || item.actualQty === '' || !qtyEqual(item.actualQty, item.expectedQty)) {
          throw new Error(SHIPMENT_NOT_READY);
        }
      }
      const validIds = new Set(shipmentItems.map((i) => i.id));
      for (const line of input.lines) {
        if (!validIds.has(line.shipmentItemId)) throw new Error(SHIPMENT_NOT_READY);
      }
      const batchNoByItem = new Map(input.lines.map((l) => [l.shipmentItemId, l.batchNo ?? null]));
      const merged = mergeInboundLines(
        shipmentItems,
        (item) => item.actualQty,
        (item) => batchNoByItem.get(item.id) ?? null,
        shipment.shipmentNo,
      );
      if (merged.length === 0) throw new Error(SHIPMENT_NOT_READY);

      const inboundNo = await nextInboundNo(exec);
      await exec.query('BEGIN');
      try {
        const inbound = await insertDraftInbound({
          inboundNo,
          shipmentId: shipment.id,
          warehouseUnitId: shipment.receiverUnitId,
          counterpartyUnitId: shipment.shipperUnitId,
          remark: input.remark,
          photoFileIds: input.photoFileIds,
          createdBy: input.createdBy,
          lines: merged,
        });
        await exec.query(
          `UPDATE shipments SET status = 'INBOUNDED', updated_at = now()
           WHERE id = ${quote(shipment.id)} AND status = 'READY'`,
        );
        await exec.query('COMMIT');
        return inbound;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async post(id: string, postedBy: string): Promise<InboundOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM inbound_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const inbound = mapInbound(locked[0]);
        if (inbound.status !== 'DRAFT') throw new Error(INBOUND_STATE_CONFLICT);

        const { rows: itemRows } = await exec.query(
          `SELECT * FROM inbound_order_items WHERE inbound_order_id = ${quote(id)}
           ORDER BY created_at ASC, id ASC`,
        );
        const items = itemRows.map(mapInboundItem);
        for (const line of items) {
          await postInboundLine(
            inbound,
            line,
            postedBy,
            inbound.sourceType === 'MANUAL'
              ? { movementType: 'INBOUND_MANUAL', sourceOrderId: inbound.id }
              : undefined,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE inbound_orders
           SET status = 'POSTED', posted_by = ${quote(postedBy)}, posted_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING *`,
        );
        if (!updated[0]) throw new Error(INBOUND_STATE_CONFLICT);
        await exec.query('COMMIT');
        return mapInbound(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };

  const returns = {
    async list(query: ReturnListQuery): Promise<ReturnListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.status) parts.push(`${alias}status = ${quote(query.status)}`);
        if (query.scopeUnitId) {
          parts.push(
           `(${alias}from_unit_id = ${quote(query.scopeUnitId)} OR ${alias}to_unit_id = ${quote(query.scopeUnitId)})`,
          );
        }
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM return_orders${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT ro.*, fu.name AS from_unit_name, tu.name AS to_unit_name, s.shipment_no
         FROM return_orders ro
         LEFT JOIN business_units fu ON fu.id = ro.from_unit_id
         LEFT JOIN business_units tu ON tu.id = ro.to_unit_id
         LEFT JOIN shipments s ON s.id = ro.shipment_id
         ${where('ro.')} ORDER BY ro.created_at DESC, ro.id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapReturn), total, page, size };
    },
    async findById(id: string): Promise<ReturnOrderRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM return_orders WHERE id = ${quote(id)} LIMIT 1`,
      );
      return rows[0] ? mapReturn(rows[0]) : null;
    },
    async listItems(returnOrderId: string): Promise<ReturnOrderItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT roi.*, i.name AS item_name
         FROM return_order_items roi
         LEFT JOIN items i ON i.id = roi.item_id
         WHERE roi.return_order_id = ${quote(returnOrderId)}
         ORDER BY roi.created_at ASC, roi.id ASC`,
      );
      return rows.map(mapReturnItem);
    },
    async createReturn(input: CreateReturnRepoInput): Promise<ReturnOrderRecord> {
      const shipment = await shipments.findById(input.shipmentId);
      if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
      if (shipment.status !== 'READY') throw new Error(RETURN_STATE_CONFLICT);

      const shipmentItems = await shipments.listItems(shipment.id);
      const byId = new Map(shipmentItems.map((i) => [i.id, i]));
      const lines: { shipmentItemId: string; itemId: string; qty: string; reason: string | null }[] = [];
      for (const line of input.lines) {
        const item = byId.get(line.shipmentItemId);
        if (!item || !item.itemId) throw new Error(RETURN_LINE_INVALID);
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0 || qty > Number(item.expectedQty)) {
          throw new Error(RETURN_LINE_INVALID);
        }
        lines.push({
          shipmentItemId: item.id,
          itemId: item.itemId,
          qty: qty.toFixed(2),
          reason: line.reason,
        });
      }
      if (lines.length === 0) throw new Error(RETURN_LINE_INVALID);

      const returnNo = await nextReturnNo(exec);
      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO return_orders
            (return_no, source_type, shipment_id, from_unit_id, to_unit_id, status,
             reason, note, photo_file_ids, return_carrier, return_tracking_no, created_by)
           VALUES (${quote(returnNo)}, 'SHIPMENT', ${quote(shipment.id)},
                  ${quote(shipment.receiverUnitId)}, ${quote(shipment.shipperUnitId)}, 'PENDING',
                  ${quote(nn(input.reason))}, ${quote(nn(input.note))}, ${photoArray(input.photoFileIds)},
                  ${quote(nn(input.returnCarrier))}, ${quote(nn(input.returnTrackingNo))},
                  ${quote(input.createdBy)})
           RETURNING *`,
        );
        const order = mapReturn(rows[0]);
        for (const line of lines) {
          await exec.query(
           `INSERT INTO return_order_items
              (return_order_id, item_id, shipment_item_id, qty, reason)
            VALUES (${quote(order.id)}, ${quote(line.itemId)}, ${quote(line.shipmentItemId)},
                    ${quote(line.qty)}, ${quote(nn(line.reason))})`,
          );
        }
        await exec.query(
          `UPDATE shipments SET status = 'RETURN_PENDING', updated_at = now()
           WHERE id = ${quote(shipment.id)} AND status = 'READY'`,
        );
        await exec.query('COMMIT');
        return order;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async accept(
      id: string,
      processedBy: string,
      note: string | null,
    ): Promise<ReturnOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM return_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapReturn(locked[0]);
        if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED);

        const shipment = order.shipmentId ? await shipments.findById(order.shipmentId) : null;
        if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');

        const { rows: itemRows } = await exec.query(
          `SELECT * FROM return_order_items WHERE return_order_id = ${quote(id)} ORDER BY id ASC`,
        );
        const returnItems = itemRows.map(mapReturnItem);
        const shipmentItems = await shipments.listItems(shipment.id);
        const returnedByShipmentItem = new Map<string, number>();
        for (const ri of returnItems) {
          if (ri.shipmentItemId) {
           returnedByShipmentItem.set(
             ri.shipmentItemId,
             (returnedByShipmentItem.get(ri.shipmentItemId) ?? 0) + Number(ri.qty),
           );
          }
        }
        const fullReturn = shipmentItems.every(
          (si) =>
           si.itemId !== null &&
           (returnedByShipmentItem.get(si.id) ?? 0) >= Number(si.expectedQty),
        );
        let shipmentStatus: 'RETURNED' | 'INBOUNDED';
        if (fullReturn) {
          shipmentStatus = 'RETURNED';
        } else {
          // 部分拒收：剩余数量自动建档 DRAFT 入库单（等待仓库 POST 过账）。
          const merged = mergeInboundLines(
           shipmentItems,
           (si) => {
             const returned = returnedByShipmentItem.get(si.id) ?? 0;
             const remaining = Number(si.expectedQty) - returned;
             return remaining > 0 ? remaining.toFixed(2) : null;
           },
           () => null,
           shipment.shipmentNo,
          );
          if (merged.length > 0) {
           const inboundNo = await nextInboundNo(exec);
           await insertDraftInbound({
             inboundNo,
             shipmentId: shipment.id,
             warehouseUnitId: shipment.receiverUnitId,
             counterpartyUnitId: shipment.shipperUnitId,
             remark: null,
             photoFileIds: [],
             createdBy: processedBy,
             lines: merged,
           });
          }
          shipmentStatus = 'INBOUNDED';
        }

        const { rows: updated } = await exec.query(
          `UPDATE return_orders
           SET status = 'CLOSED', processed_by = ${quote(processedBy)},
               processed_at = now(), processed_note = ${quote(nn(note))}, updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(RETURN_ALREADY_PROCESSED);
        await exec.query(
          `UPDATE shipments SET status = ${quote(shipmentStatus)}, updated_at = now()
           WHERE id = ${quote(shipment.id)} AND status = 'RETURN_PENDING'`,
        );
        await exec.query('COMMIT');
        return mapReturn(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async reject(
      id: string,
      processedBy: string,
      note: string,
    ): Promise<ReturnOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM return_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const order = mapReturn(locked[0]);
        if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED);

        const { rows: updated } = await exec.query(
          `UPDATE return_orders
           SET status = 'REJECTED', processed_by = ${quote(processedBy)},
               processed_at = now(), processed_note = ${quote(note)}, updated_at = now()
           WHERE id = ${quote(id)} AND status = 'PENDING' RETURNING *`,
        );
        if (!updated[0]) throw new Error(RETURN_ALREADY_PROCESSED);
        if (order.shipmentId) {
          await exec.query(
           `UPDATE shipments SET status = 'READY', updated_at = now()
             WHERE id = ${quote(order.shipmentId)} AND status = 'RETURN_PENDING'`,
          );
        }
        await exec.query('COMMIT');
        return mapReturn(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };

  const outbounds = {
    async list(query: OutboundListQuery): Promise<OutboundListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.status) parts.push(`${alias}status = ${quote(query.status)}`);
        if (query.type) parts.push(`${alias}type = ${quote(query.type)}`);
        if (query.warehouseUnitId) {
          parts.push(`${alias}warehouse_unit_id = ${quote(query.warehouseUnitId)}`);
        }
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM outbound_orders${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT oo.*, bu.name AS warehouse_name, cp.name AS counterparty_name
         FROM outbound_orders oo
         LEFT JOIN business_units bu ON bu.id = oo.warehouse_unit_id
         LEFT JOIN business_units cp ON cp.id = oo.counterparty_unit_id
         ${where('oo.')} ORDER BY oo.created_at DESC, oo.id ASC LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapOutbound), total, page, size };
    },
    async findById(id: string): Promise<OutboundOrderRecord | null> {
      const { rows } = await exec.query(
        `SELECT * FROM outbound_orders WHERE id = ${quote(id)} LIMIT 1`,
      );
      return rows[0] ? mapOutbound(rows[0]) : null;
    },
    async listItems(outboundOrderId: string): Promise<OutboundOrderItemRecord[]> {
      const { rows } = await exec.query(
        `SELECT ooi.*, i.name AS item_name, i.spec_unit AS spec, b.batch_no
         FROM outbound_order_items ooi
         LEFT JOIN items i ON i.id = ooi.item_id
         LEFT JOIN batches b ON b.id = ooi.batch_id
         WHERE ooi.outbound_order_id = ${quote(outboundOrderId)}
         ORDER BY ooi.created_at ASC, ooi.id ASC`,
      );
      return rows.map(mapOutboundItem);
    },
    async create(input: CreateOutboundRepoInput): Promise<OutboundOrderRecord> {
      const outboundNo = await nextOutboundNo(exec);
      await exec.query('BEGIN');
      try {
        const { rows } = await exec.query(
          `INSERT INTO outbound_orders
             (outbound_no, type, warehouse_unit_id, counterparty_unit_id, status,
              loss_reason, remark, photo_file_ids, created_by)
           VALUES (${quote(outboundNo)}, ${quote(input.type)}, ${quote(input.warehouseUnitId)},
                  ${quote(input.counterpartyUnitId)}, 'DRAFT', ${quote(nn(input.lossReason))},
                  ${quote(nn(input.remark))},
                  ${photoArray(input.photoFileIds)}, ${quote(input.createdBy)})
           RETURNING *`,
        );
        const outbound = mapOutbound(rows[0]);
        for (const line of input.lines) {
          await exec.query(
            `INSERT INTO outbound_order_items
               (outbound_order_id, item_id, batch_id, qty)
             VALUES (${quote(outbound.id)}, ${quote(line.itemId)}, ${quote(line.batchId)},
                    ${quote(line.qty)})`,
          );
        }
        await exec.query('COMMIT');
        return outbound;
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
    async post(id: string, postedBy: string): Promise<OutboundOrderRecord | null> {
      await exec.query('BEGIN');
      try {
        const { rows: locked } = await exec.query(
          `SELECT * FROM outbound_orders WHERE id = ${quote(id)} FOR UPDATE`,
        );
        if (!locked[0]) {
          await exec.query('ROLLBACK');
          return null;
        }
        const outbound = mapOutbound(locked[0]);
        if (outbound.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT);

        const { rows: itemRows } = await exec.query(
          `SELECT ooi.*, i.spec_unit AS spec FROM outbound_order_items ooi
           LEFT JOIN items i ON i.id = ooi.item_id
           WHERE ooi.outbound_order_id = ${quote(id)}
           ORDER BY ooi.created_at ASC, ooi.id ASC`,
        );
        const items = itemRows.map(mapOutboundItem);
        // ck-08b：报损（type=LOSS）→ OUTBOUND_LOSS 流水；手工出库 → OUTBOUND_NORMAL。
        const movementType = outbound.type === 'LOSS' ? 'OUTBOUND_LOSS' : 'OUTBOUND_NORMAL';
        const allocations: { itemId: string; batchId: string; qty: number; unitCost: string }[] = [];
        for (const line of items) {
          const qty = Number(line.qty);
          if (line.batchId) {
            const { rows: stockRows } = await exec.query(
              `SELECT qty, avg_cost FROM stock
                WHERE unit_id = ${quote(outbound.warehouseUnitId)}
                  AND item_id = ${quote(line.itemId)}
                  AND batch_id = ${quote(line.batchId)}
                FOR UPDATE`,
            );
            if (!stockRows[0]) throw new Error(STOCK_BATCH_NOT_FOUND);
            const avail = Number(String(stockRows[0].qty ?? '0'));
            if (avail < qty) throw new Error(INSUFFICIENT_STOCK);
            allocations.push({
              itemId: line.itemId,
              batchId: line.batchId,
              qty,
              unitCost: String(stockRows[0].avg_cost ?? '0'),
            });
          } else {
            const { rows: fefoRows } = await exec.query(
              `SELECT s.batch_id, s.qty, s.avg_cost
               FROM stock s
               JOIN batches b ON b.id = s.batch_id
               WHERE s.unit_id = ${quote(outbound.warehouseUnitId)}
                 AND s.item_id = ${quote(line.itemId)}
                 AND s.qty > 0
               ORDER BY b.expiry_date ASC NULLS LAST,
                        b.production_date ASC NULLS LAST, s.batch_id ASC
               FOR UPDATE`,
            );
            const availTotal = fefoRows.reduce(
              (sum, r) => sum + Number(String(r.qty ?? '0')),
              0,
            );
            if (availTotal < qty) throw new Error(INSUFFICIENT_STOCK);
            let remaining = qty;
            for (const row of fefoRows) {
              if (remaining <= 0) break;
              const take = Math.min(Number(String(row.qty ?? '0')), remaining);
              allocations.push({
                itemId: line.itemId,
                batchId: String(row.batch_id),
                qty: take,
                unitCost: String(row.avg_cost ?? '0'),
              });
              remaining -= take;
            }
          }
        }

        await exec.query(
          `DELETE FROM outbound_order_items WHERE outbound_order_id = ${quote(id)}`,
        );
        for (const alloc of allocations) {
          const { rows: updated } = await exec.query(
            `UPDATE stock
             SET qty = qty - ${quote(alloc.qty.toFixed(2))}, version = version + 1, updated_at = now()
             WHERE unit_id = ${quote(outbound.warehouseUnitId)}
               AND item_id = ${quote(alloc.itemId)}
               AND batch_id = ${quote(alloc.batchId)}
               AND qty >= ${quote(alloc.qty.toFixed(2))}
             RETURNING qty`,
          );
          if (!updated[0]) throw new Error(INSUFFICIENT_STOCK);
          const qtyAfter = Number(String(updated[0].qty));
          const qtyBefore = qtyAfter + alloc.qty;
          await exec.query(
            `INSERT INTO stock_movements
               (unit_id, item_id, batch_id, type, qty_delta, qty_before, qty_after, unit_cost,
                order_type, order_id, ref_no, operator_id)
             VALUES (${quote(outbound.warehouseUnitId)}, ${quote(alloc.itemId)},
                    ${quote(alloc.batchId)}, ${quote(movementType)},
                    ${quote(`-${alloc.qty.toFixed(2)}`)}, ${quote(qtyBefore.toFixed(2))},
                    ${quote(qtyAfter.toFixed(2))}, ${quote(alloc.unitCost)}, 'outbound',
                    ${quote(outbound.id)}, ${quote(outbound.outboundNo)}, ${quote(postedBy)})`,
          );
          await exec.query(
            `INSERT INTO outbound_order_items
               (outbound_order_id, item_id, batch_id, qty, unit_cost)
             VALUES (${quote(outbound.id)}, ${quote(alloc.itemId)}, ${quote(alloc.batchId)},
                    ${quote(alloc.qty.toFixed(2))}, ${quote(alloc.unitCost)})`,
          );
        }
        const { rows: updated } = await exec.query(
          `UPDATE outbound_orders
           SET status = 'POSTED', posted_by = ${quote(postedBy)}, posted_at = now(), updated_at = now()
           WHERE id = ${quote(id)} AND status = 'DRAFT' RETURNING *`,
        );
        if (!updated[0]) throw new Error(OUTBOUND_STATE_CONFLICT);
        await exec.query('COMMIT');
        return mapOutbound(updated[0]);
      } catch (err) {
        await exec.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    },
  };

  const stock = {
    async list(query: StockListQuery): Promise<StockListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [`${alias}qty > 0`];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        if (query.batchId) parts.push(`${alias}batch_id = ${quote(query.batchId)}`);
        return ` WHERE ${parts.join(' AND ')}`;
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM stock${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT s.*, bu.name AS unit_name, i.name AS item_name, i.spec_unit AS spec,
                b.batch_no, b.production_date, b.expiry_date
         FROM stock s
         JOIN business_units bu ON bu.id = s.unit_id
         JOIN items i ON i.id = s.item_id
         JOIN batches b ON b.id = s.batch_id
         ${where('s.')}
         ORDER BY bu.name ASC, i.name ASC, b.expiry_date ASC NULLS LAST, s.batch_id ASC
         LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapStockRow), total, page, size };
    },
    async listMovements(
      query: StockMovementListQuery,
    ): Promise<StockMovementListResult> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        if (query.batchId) parts.push(`${alias}batch_id = ${quote(query.batchId)}`);
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const size = Math.min(Math.max(query.size ?? 20, 1), 50);
      const page = Math.max(query.page ?? 1, 1);
      const offset = (page - 1) * size;
      const totalResult = await exec.query(
        `SELECT count(*)::int AS n FROM stock_movements${where('')}`,
      );
      const total = Number(totalResult.rows[0]?.n ?? 0);
      const { rows } = await exec.query(
        `SELECT m.*, bu.name AS unit_name, i.name AS item_name, i.spec_unit AS spec,
                b.batch_no
         FROM stock_movements m
         LEFT JOIN business_units bu ON bu.id = m.unit_id
         LEFT JOIN items i ON i.id = m.item_id
         LEFT JOIN batches b ON b.id = m.batch_id
         ${where('m.')}
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ${size} OFFSET ${offset}`,
      );
      return { items: rows.map(mapStockMovement), total, page, size };
    },
    async listBatches(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
      const where = (alias: string): string => {
        const parts: string[] = [`${alias}qty > 0`];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        return ` WHERE ${parts.join(' AND ')}`;
      };
      const { rows } = await exec.query(
        `SELECT s.*, bu.name AS unit_name, i.name AS item_name, i.spec_unit AS spec,
                b.batch_no, b.production_date, b.expiry_date
         FROM stock s
         JOIN business_units bu ON bu.id = s.unit_id
         JOIN items i ON i.id = s.item_id
         JOIN batches b ON b.id = s.batch_id
         ${where('s.')}
         ORDER BY bu.name ASC, i.name ASC, b.expiry_date ASC NULLS LAST, s.batch_id ASC`,
      );
      return rows.map(mapStockRow).map(attachExpiry);
    },
    async listExpired(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
      const where = (alias: string): string => {
        const parts: string[] = [
          `${alias}qty > 0`,
          `${alias}expiry_date IS NOT NULL AND ${alias}expiry_date < CURRENT_DATE`,
        ];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        return ` WHERE ${parts.join(' AND ')}`;
      };
      const { rows } = await exec.query(
        `SELECT s.*, bu.name AS unit_name, i.name AS item_name, i.spec_unit AS spec,
                b.batch_no, b.production_date, b.expiry_date
         FROM stock s
         JOIN business_units bu ON bu.id = s.unit_id
         JOIN items i ON i.id = s.item_id
         JOIN batches b ON b.id = s.batch_id
         ${where('s.')}
         ORDER BY b.expiry_date ASC NULLS LAST, bu.name ASC, i.name ASC`,
      );
      return rows.map(mapStockRow).map(attachExpiry);
    },
  };

  // ── ck-08b：零售价（retail_prices + retail_price_history）─────────────────────────

  const retailPrices: RetailPriceRepository = {
    async list(query: RetailPriceListQuery): Promise<RetailPriceRecord[]> {
      const where = (alias: string): string => {
        const parts: string[] = [];
        if (query.unitId) parts.push(`${alias}unit_id = ${quote(query.unitId)}`);
        if (query.itemId) parts.push(`${alias}item_id = ${quote(query.itemId)}`);
        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      };
      const { rows } = await exec.query(
        `SELECT rp.*, bu.name AS unit_name, i.name AS item_name, i.spec_unit AS spec,
                bu2.name AS updated_by_name,
                (SELECT CASE WHEN SUM(s.qty) > 0
                        THEN ROUND(SUM(s.qty * s.avg_cost) / SUM(s.qty), 2)
                        ELSE NULL END
                 FROM stock s
                 WHERE s.unit_id = rp.unit_id AND s.item_id = rp.item_id) AS unit_cost
         FROM retail_prices rp
         JOIN business_units bu ON bu.id = rp.unit_id
         JOIN items i ON i.id = rp.item_id
         LEFT JOIN users bu2 ON bu2.id = rp.updated_by
         ${where('rp.')}
         ORDER BY bu.name ASC, i.name ASC`,
      );
      return rows.map(mapRetailPrice);
    },
    async setPrice(input: {
      unitId: string;
      itemId: string;
      price: string;
      currency: string;
      updatedBy: string;
    }): Promise<RetailPriceRecord> {
      const now = 'now()';
      const { rows } = await exec.query(
        `INSERT INTO retail_prices (unit_id, item_id, price, currency, updated_by, updated_at)
         VALUES (${quote(input.unitId)}, ${quote(input.itemId)}, ${quote(input.price)},
                 ${quote(input.currency)}, ${quote(input.updatedBy)}, ${now})
         ON CONFLICT (unit_id, item_id)
         DO UPDATE SET price = EXCLUDED.price, currency = EXCLUDED.currency,
                       updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING *`,
      );
      await exec.query(
        `INSERT INTO retail_price_history (unit_id, item_id, price, currency, updated_by, updated_at)
         VALUES (${quote(input.unitId)}, ${quote(input.itemId)}, ${quote(input.price)},
                 ${quote(input.currency)}, ${quote(input.updatedBy)}, ${now})`,
      );
      const hydrated = await retailPrices.list({ unitId: input.unitId, itemId: input.itemId });
      return hydrated[0] ?? mapRetailPrice(rows[0]);
    },
    async listHistory(unitId: string, itemId: string): Promise<RetailPriceHistoryRecord[]> {
      const { rows } = await exec.query(
        `SELECT h.*, bu.name AS unit_name, i.name AS item_name, i.spec_unit AS spec,
                u.name AS updated_by_name
         FROM retail_price_history h
         JOIN business_units bu ON bu.id = h.unit_id
         JOIN items i ON i.id = h.item_id
         LEFT JOIN users u ON u.id = h.updated_by
         WHERE h.unit_id = ${quote(unitId)} AND h.item_id = ${quote(itemId)}
         ORDER BY h.updated_at DESC, h.id DESC`,
      );
      return rows.map(mapRetailPriceHistory);
    },
  };

  // ── ck-08b：站内通知（notifications，发送端 ck-10 联接）────────────────────────

  const notifications = {
    async create(input: {
      userId?: string | null;
      unitId?: string | null;
      type: string;
      title: string;
      content?: string | null;
      link?: string | null;
    }): Promise<NotificationRecord> {
      const { rows } = await exec.query(
        `INSERT INTO notifications (user_id, unit_id, type, title, content, link)
         VALUES (${quote(input.userId ?? null)}, ${quote(input.unitId ?? null)},
                 ${quote(input.type)}, ${quote(input.title)},
                 ${quote(input.content ?? null)}, ${quote(input.link ?? null)})
         RETURNING *`,
      );
      return mapNotification(rows[0]);
    },
    async list(query?: { unitId?: string; userId?: string }): Promise<NotificationRecord[]> {
      const parts: string[] = [];
      if (query?.unitId) parts.push(`unit_id = ${quote(query.unitId)}`);
      if (query?.userId) parts.push(`user_id = ${quote(query.userId)}`);
      const where = parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      const { rows } = await exec.query(
        `SELECT * FROM notifications${where} ORDER BY created_at DESC, id DESC`,
      );
      return rows.map(mapNotification);
    },
  };

  return { users, units, items, files, shipments, inbounds, returns, outbounds, stock, retailPrices, notifications };
}

// 将 undefined/空字符串归一化为 null（写入 DB 的 NULL）。
function nn(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
