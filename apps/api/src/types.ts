import type {
  DeliveryMethod,
  InboundSourceType,
  InboundStatus,
  ItemStatus,
  OutboundStatus,
  OutboundType,
  ReturnSourceType,
  ReturnStatus,
  ReviewStatus,
  SalesSource,
  SalesStatus,
  ShipmentStatus,
  SpecUnit,
  StockMovementType,
  UnitType,
  UserRole,
  UserStatus,
} from '@otunlink/shared';

// 认证与数据层共享类型（ck-02）。
// Repository 接口是「生产 Drizzle / 测试内存实现」的接缝：生产最终应以
// drizzle-orm 查询构建替换本 checkpoint 的 SQL 实现，注入方式不变。

export interface JwksKv {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** Worker 运行时绑定与环境变量（本地 dev 来自 .dev.vars）。 */
export interface Env extends Record<string, unknown> {
  ENTRA_TENANT_ID?: string;
  ENTRA_CLIENT_ID?: string;
  ENTRA_AUDIENCE?: string;
  ENTRA_ISSUER?: string;
  JWKS_CACHE?: JwksKv;
  HYPERDRIVE?: unknown;
  DATABASE_URL?: string;
  ADMIN_SECRET?: string;
  // S3 兼容对象存储（华为云 OBS，见 docs/cloud-config.md）
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
}

export interface TokenClaims {
  /** Entra v2.0 的 sub（工作账号通常等于 oid）。 */
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
}

export interface UserRecord {
  id: string;
  entraSub: string;
  email: string;
  name: string;
  role: UserRole | null;
  scopeUnitId: string | null;
  status: UserStatus;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UnitRecord {
  id: string;
  code: string;
  name: string;
  type: UnitType;
  address: string | null;
  contact: string | null;
  timezone: string;
  baseCurrency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  entraSub: string;
  email: string;
  name: string;
  role?: UserRole | null;
  scopeUnitId?: string | null;
  status?: UserStatus;
  locale?: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole | null;
  scopeUnitId?: string | null;
  status?: UserStatus;
  locale?: string;
}

export interface CreateUnitInput {
  code: string;
  name: string;
  type: UnitType;
  address?: string | null;
  contact?: string | null;
  timezone?: string;
  baseCurrency?: string;
  isActive?: boolean;
}

export interface UpdateUnitInput {
  code?: string;
  name?: string;
  type?: UnitType;
  address?: string | null;
  contact?: string | null;
  timezone?: string;
  baseCurrency?: string;
  isActive?: boolean;
}

// ── 物品 / 文件（ck-04）────────────────────────────────────────────────────

export interface ItemRecord {
  id: string;
  sku: string | null;
  name: string;
  barcode: string | null;
  specUnit: SpecUnit;
  innerUnit: SpecUnit | null;
  innerCount: string | null;
  isPerishable: boolean;
  category: string | null;
  description: string | null;
  status: ItemStatus;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileRecord {
  id: string;
  key: string;
  thumbnailKey: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export interface ItemImageRecord {
  id: string;
  itemId: string;
  fileId: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
  /** 联表带出的文件信息（列表/详情返回用）。 */
  file?: FileRecord;
}

export interface CreateItemInput {
  sku?: string | null;
  name: string;
  barcode?: string | null;
  specUnit?: SpecUnit;
  innerUnit?: SpecUnit | null;
  innerCount?: string | null;
  isPerishable?: boolean;
  category?: string | null;
  description?: string | null;
  status?: ItemStatus;
  createdBy: string;
}

export interface UpdateItemInput {
  sku?: string | null;
  name?: string;
  barcode?: string | null;
  specUnit?: SpecUnit;
  innerUnit?: SpecUnit | null;
  innerCount?: string | null;
  isPerishable?: boolean;
  category?: string | null;
  description?: string | null;
  status?: ItemStatus;
}

export interface CreateFileInput {
  key: string;
  thumbnailKey: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface ItemListQuery {
  q?: string;
  page?: number;
  size?: number;
}

export interface ItemListResult {
  items: ItemRecord[];
  total: number;
  page: number;
  size: number;
}

export interface UserRepository {
  findByEntraSub(sub: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  list(): Promise<UserRecord[]>;
  create(input: CreateUserInput): Promise<UserRecord>;
  update(id: string, patch: UpdateUserInput): Promise<UserRecord | null>;
}

export interface UnitRepository {
  findById(id: string): Promise<UnitRecord | null>;
  list(opts?: { includeInactive?: boolean; scopeUnitId?: string }): Promise<UnitRecord[]>;
  create(input: CreateUnitInput): Promise<UnitRecord>;
  update(id: string, patch: UpdateUnitInput): Promise<UnitRecord | null>;
}

export interface ItemRepository {
  findById(id: string): Promise<ItemRecord | null>;
  findByBarcode(code: string): Promise<ItemRecord | null>;
  list(query: ItemListQuery): Promise<ItemListResult>;
  create(input: CreateItemInput): Promise<ItemRecord>;
  update(id: string, patch: UpdateItemInput): Promise<ItemRecord | null>;
  listImages(itemId: string): Promise<ItemImageRecord[]>;
  attachImages(itemId: string, fileIds: string[]): Promise<ItemImageRecord[]>;
}

export interface FileRepository {
  findById(id: string): Promise<FileRecord | null>;
  create(input: CreateFileInput): Promise<FileRecord>;
}

// ── 发货单（ck-05）────────────────────────────────────────────────────────

export interface ShipmentRecord {
  id: string;
  shipmentNo: string;
  shipperUnitId: string;
  receiverUnitId: string;
  status: ShipmentStatus;
  boxesCount: number;
  currency: string;
  expectedArrivalDate: string | null;
  remark: string | null;
  sentAt: Date | null;
  /** 点货草稿版本号（乐观并发，ck-06）。 */
  countVersion: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentTrackingRecord {
  id: string;
  shipmentId: string;
  carrier: string;
  trackingNo: string;
  note: string | null;
  createdAt: Date;
}

export interface ShipmentItemRecord {
  id: string;
  shipmentId: string;
  itemId: string | null;
  name: string;
  spec: string | null;
  expectedQty: string;
  actualQty: string | null;
  unitPrice: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  lineNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateShipmentTrackingInput {
  carrier: string;
  trackingNo: string;
  note: string | null;
}

export interface CreateShipmentItemInput {
  itemId: string;
  /** 下单时快照（由路由层从物品目录读出）。 */
  name: string;
  spec: string | null;
  expectedQty: string;
  unitPrice: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  lineNote: string | null;
}

export interface CreateShipmentInput {
  shipperUnitId: string;
  receiverUnitId: string;
  boxesCount: number;
  currency: string;
  expectedArrivalDate: string | null;
  remark: string | null;
  trackings: CreateShipmentTrackingInput[];
  items: CreateShipmentItemInput[];
  createdBy: string;
}

export interface UpdateShipmentInput {
  shipperUnitId?: string;
  receiverUnitId?: string;
  boxesCount?: number;
  currency?: string;
  expectedArrivalDate?: string | null;
  remark?: string | null;
  trackings?: CreateShipmentTrackingInput[];
  items?: CreateShipmentItemInput[];
}

export interface ShipmentListQuery {
  page?: number;
  size?: number;
  status?: ShipmentStatus;
  /** 数据范围：仅返回发货方或收货方等于该单元的单据。 */
  scopeUnitId?: string;
}

export interface ShipmentListResult {
  items: ShipmentRecord[];
  total: number;
  page: number;
  size: number;
}

// ── 差异修订（ck-06）───────────────────────────────────────────────────────
// 对应 packages/db schema.ts discrepancy_reviews / discrepancy_review_items。

export interface DiscrepancyReviewItemRecord {
  id: string;
  reviewId: string;
  shipmentItemId: string;
  expectedQtyBefore: string;
  actualQty: string;
  reason: string | null;
}

export interface DiscrepancyReviewRecord {
  id: string;
  shipmentId: string;
  status: ReviewStatus;
  reason: string | null;
  photoFileIds: string[];
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** 联表带出的明细（findReview / listReviews 填充）。 */
  items?: DiscrepancyReviewItemRecord[];
}

export interface CreateReviewLineInput {
  shipmentItemId: string;
  actualQty: string;
  expectedQtyBefore: string;
  reason: string | null;
}

export interface CreateReviewInput {
  shipmentId: string;
  reason: string | null;
  photoFileIds: string[];
  submittedBy: string | null;
  lines: CreateReviewLineInput[];
}

/** 点货保存结果：返回最新行与版本号（前端以新版本继续编辑）。 */
export interface SaveCountResult {
  shipment: ShipmentRecord;
  /** 递增后的 count_version。 */
  countVersion: number;
}

export interface ShipmentRepository {
  findById(id: string): Promise<ShipmentRecord | null>;
  findByNo(no: string): Promise<ShipmentRecord | null>;
  list(query: ShipmentListQuery): Promise<ShipmentListResult>;
  create(input: CreateShipmentInput): Promise<ShipmentRecord>;
  update(id: string, patch: UpdateShipmentInput): Promise<ShipmentRecord | null>;
  /** DRAFT → SENT，记录 sent_at；非 DRAFT 抛 SHIPMENT_STATE_CONFLICT 信号。 */
  send(id: string): Promise<ShipmentRecord | null>;
  listTrackings(shipmentId: string): Promise<ShipmentTrackingRecord[]>;
  listTrackingsForShipments(ids: string[]): Promise<Map<string, ShipmentTrackingRecord[]>>;
  listItems(shipmentId: string): Promise<ShipmentItemRecord[]>;
  // ── 收货点货与差异协商（ck-06）─────────────────────────────────────────────
  /** SENT → COUNTING；非 SENT 抛 COUNTING_STATE_CONFLICT 信号。 */
  startCounting(id: string): Promise<ShipmentRecord | null>;
  /**
   * 保存点货草稿（COUNTING/DISCREPANCY）：CAS 版本号防并发；保存后按
   * 实收=应收重算状态（无差异 → READY / 有差异 → DISCREPANCY）。
   * 版本不匹配抛 COUNTING_STATE_CONFLICT；行不属于该单抛 COUNT_LINE_INVALID 信号。
   */
  saveCount(id: string, input: ShipmentCountRepoInput): Promise<SaveCountResult | null>;
  /**
   * 提交差异修订（DISCREPANCY 且存在差异行）：状态 → REVIEW_PENDING；
   * 已有 PENDING 抛 REVIEW_ALREADY_PROCESSED；无差异抛 REVIEW_NO_DIFFERENCE 信号。
   */
  createReview(input: CreateReviewInput): Promise<DiscrepancyReviewRecord>;
  /** 按创建时间倒序（含 items）。 */
  listReviews(shipmentId: string): Promise<DiscrepancyReviewRecord[]>;
  findReview(id: string): Promise<DiscrepancyReviewRecord | null>;
  /**
   * 审批通过（PENDING → APPROVED）：各行 expected_qty := actual_qty（保留
   * expected_qty_before 快照），发货单 → READY；写 audit_logs。
   * 非 PENDING 抛 REVIEW_ALREADY_PROCESSED 信号。
   */
  approveReview(id: string, reviewedBy: string | null): Promise<DiscrepancyReviewRecord | null>;
  /** 审批拒绝（PENDING → REJECTED）：记录理由与审批人；发货单 → DISCREPANCY（可修改重提）。 */
  rejectReview(
    id: string,
    reviewedBy: string | null,
    reason: string,
  ): Promise<DiscrepancyReviewRecord | null>;
}

/** saveCount 的仓库入参（路由层从 shared zod 校验后转换）。 */
export interface ShipmentCountRepoInput {
  version: number;
  lines: { shipmentItemId: string; actualQty: string }[];
}

// ── 确认入库与发货退货（ck-07）──────────────────────────────────────────────
// 对应 packages/db schema.ts inbound_orders / inbound_order_items / return_orders /
// return_order_items / batches / stock / stock_movements。

export interface InboundOrderRecord {
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
  postedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundOrderItemRecord {
  id: string;
  inboundOrderId: string;
  itemId: string;
  batchId: string | null;
  qty: string;
  unitCost: string;
  lineNote: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  batchNo: string | null;
  createdAt: Date;
  /** 联表带出（列表/详情展示用）。 */
  itemName?: string | null;
  spec?: string | null;
}

export interface ReturnOrderRecord {
  id: string;
  returnNo: string;
  sourceType: ReturnSourceType;
  shipmentId: string | null;
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
  processedAt: Date | null;
  processedNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnOrderItemRecord {
  id: string;
  returnOrderId: string;
  itemId: string;
  shipmentItemId: string | null;
  qty: string;
  originalBatchId: string | null;
  reason: string | null;
  createdAt: Date;
  /** 联表带出（列表/详情展示用）。 */
  itemName?: string | null;
}

/** 确认收货（POST /shipments/:id/confirm-receipt）仓库入参。 */
export interface ConfirmReceiptRepoInput {
  remark: string | null;
  photoFileIds: string[];
  createdBy: string;
  lines: { shipmentItemId: string; batchNo: string | null }[];
}

/** 发起发货退货（POST /shipments/:id/returns）仓库入参。 */
export interface CreateReturnRepoInput {
  shipmentId: string;
  reason: string | null;
  note: string | null;
  photoFileIds: string[];
  returnCarrier: string | null;
  returnTrackingNo: string | null;
  createdBy: string;
  lines: { shipmentItemId: string; qty: string; reason: string | null }[];
}

/** 新建手动入库单（POST /inbound-orders, sourceType=MANUAL）仓库入参。 */
export interface CreateInboundManualRepoInput {
  warehouseUnitId: string;
  counterpartyUnitId: string | null;
  remark: string | null;
  photoFileIds: string[];
  createdBy: string;
  lines: {
    itemId: string;
    qty: string;
    unitCost: string | null;
    productionDate: string | null;
    expiryDate: string | null;
    batchNo: string | null;
    lineNote: string | null;
  }[];
}

export interface InboundListQuery {
  page?: number;
  size?: number;
  status?: InboundStatus;
  /** 数据范围：仅返回该仓库的入库单。 */
  warehouseUnitId?: string;
}

export interface InboundListResult {
  items: InboundOrderRecord[];
  total: number;
  page: number;
  size: number;
}

export interface ReturnListQuery {
  page?: number;
  size?: number;
  status?: ReturnStatus;
  /** 数据范围：from 或 to 命中即返回。 */
  scopeUnitId?: string;
}

export interface ReturnListResult {
  items: ReturnOrderRecord[];
  total: number;
  page: number;
  size: number;
}

export interface InboundRepository {
  list(query: InboundListQuery): Promise<InboundListResult>;
  findById(id: string): Promise<InboundOrderRecord | null>;
  listItems(inboundOrderId: string): Promise<InboundOrderItemRecord[]>;
  /**
   * 确认收货：发货单 READY → INBOUNDED，自动创建 DRAFT 入库单 + 明细
   * （批次信息随行捕获；成本价 = 发货单行 unit_price）。非 READY 或存在差异
   * 行抛 SHIPMENT_NOT_READY 信号。
   */
  confirmReceipt(shipmentId: string, input: ConfirmReceiptRepoInput): Promise<InboundOrderRecord>;
  /**
   * 新建手动入库单（sourceType=MANUAL，DRAFT）：对手方（供应商）+ 仓库 +
   * 清单（批次信息可选，缺省过账时自动生成）。
   */
  createManual(input: CreateInboundManualRepoInput): Promise<InboundOrderRecord>;
  /**
   * 入库过账：DRAFT → POSTED；按行建档批次、写 stock + stock_movements
   * （INBOUND_SHIPMENT / INBOUND_MANUAL）。非 DRAFT 抛 INBOUND_STATE_CONFLICT 信号。
   */
  post(id: string, postedBy: string): Promise<InboundOrderRecord | null>;
}

export interface ReturnRepository {
  list(query: ReturnListQuery): Promise<ReturnListResult>;
  findById(id: string): Promise<ReturnOrderRecord | null>;
  listItems(returnOrderId: string): Promise<ReturnOrderItemRecord[]>;
  /**
   * 发起拒收：发货单 READY → RETURN_PENDING，创建 PENDING 退货单 + 明细。
   * 非 READY 抛 RETURN_STATE_CONFLICT；行非法抛 RETURN_LINE_INVALID 信号。
   */
  createReturn(input: CreateReturnRepoInput): Promise<ReturnOrderRecord>;
  /**
   * 接受退货：PENDING → CLOSED；全拒 → 发货单 RETURNED，部分 → 剩余自动建档
   * DRAFT 入库单 + 发货单 INBOUNDED。非 PENDING 抛 RETURN_ALREADY_PROCESSED 信号。
   */
  accept(id: string, processedBy: string, note: string | null): Promise<ReturnOrderRecord | null>;
  /**
   * 拒绝退货：PENDING → REJECTED；发货单 → READY（可调整后重新发起）。
   * 非 PENDING 抛 RETURN_ALREADY_PROCESSED 信号。
   */
  reject(id: string, processedBy: string, note: string): Promise<ReturnOrderRecord | null>;
}

// ── 库存台账与手动出入库（ck-08a）──────────────────────────────────────────────
// 对应 packages/db schema.ts outbound_orders / outbound_order_items 与既有
// batches / stock / stock_movements。出库过账行级写流水，voucher 以流水为准。

export interface OutboundOrderRecord {
  id: string;
  outboundNo: string;
  type: OutboundType;
  warehouseUnitId: string;
  counterpartyUnitId: string | null;
  status: OutboundStatus;
  lossReason: string | null;
  photoFileIds: string[];
  remark: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboundOrderItemRecord {
  id: string;
  outboundOrderId: string;
  itemId: string;
  batchId: string | null;
  qty: string;
  unitCost: string | null;
  createdAt: Date;
  /** 联表带出（列表/详情展示用）。 */
  itemName?: string | null;
  spec?: string | null;
  batchNo?: string | null;
}

/** 新建出库单（POST /outbound-orders）：NORMAL 手工出库 / LOSS 报损（ck-08b）。 */
export interface CreateOutboundRepoInput {
  warehouseUnitId: string;
  counterpartyUnitId: string | null;
  type: OutboundType;
  /** 报损原因（type=LOSS 必填；路由层已校验）。 */
  lossReason: string | null;
  remark: string | null;
  photoFileIds: string[];
  createdBy: string;
  lines: { itemId: string; qty: string; batchId: string | null }[];
}

export interface OutboundListQuery {
  page?: number;
  size?: number;
  status?: OutboundStatus;
  type?: OutboundType;
  /** 数据范围：仅返回该仓库的出库单。 */
  warehouseUnitId?: string;
}

export interface OutboundListResult {
  items: OutboundOrderRecord[];
  total: number;
  page: number;
  size: number;
}

export interface OutboundRepository {
  list(query: OutboundListQuery): Promise<OutboundListResult>;
  findById(id: string): Promise<OutboundOrderRecord | null>;
  listItems(outboundOrderId: string): Promise<OutboundOrderItemRecord[]>;
  /** 新建 DRAFT 出库单 + 明细（batchId 缺省，过账时 FEFO 分配）。 */
  create(input: CreateOutboundRepoInput): Promise<OutboundOrderRecord>;
  /**
   * 出库过账：DRAFT → POSTED；按行 FEFO（无 batchId）或指定 batchId 扣减
   * stock 并写 stock_movements（OUTBOUND_NORMAL），回填分配与成本快照。
   * 非 DRAFT 抛 OUTBOUND_STATE_CONFLICT；库存不足抛 INSUFFICIENT_STOCK；
   * 指定批次不存在抛 STOCK_BATCH_NOT_FOUND 信号。
   */
  post(id: string, postedBy: string): Promise<OutboundOrderRecord | null>;
}

/** 库存台账行（stock JOIN batches/items/units）。 */
export interface StockRowRecord {
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  batchId: string;
  batchNo: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  qty: string;
  avgCost: string;
  version: number;
  updatedAt: Date;
}

/** 台账流水（stock_movements JOIN 展示字段）。 */
export interface StockMovementRecord {
  id: string;
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  batchId: string;
  batchNo: string | null;
  type: StockMovementType;
  qtyDelta: string;
  qtyBefore: string;
  qtyAfter: string;
  unitCost: string | null;
  orderType: string | null;
  orderId: string | null;
  refNo: string | null;
  note: string | null;
  operatorId: string | null;
  createdAt: Date;
}

export interface StockListQuery {
  page?: number;
  size?: number;
  unitId?: string;
  itemId?: string;
  batchId?: string;
}

export interface StockListResult {
  items: StockRowRecord[];
  total: number;
  page: number;
  size: number;
}

export interface StockMovementListQuery {
  page?: number;
  size?: number;
  unitId?: string;
  itemId?: string;
  batchId?: string;
}

export interface StockMovementListResult {
  items: StockMovementRecord[];
  total: number;
  page: number;
  size: number;
}

/** 库存批次视图记录（叠加效期计算字段，ck-08b）。 */
export interface StockBatchRecord extends StockRowRecord {
  /** 剩余天数（按 UTC 当日）；null = 无到期日。 */
  remainingDays: number | null;
  /** 已过期（remainingDays < 0）。 */
  isExpired: boolean;
}

export interface StockBatchListQuery {
  unitId?: string;
  itemId?: string;
}

export interface StockRepository {
  list(query: StockListQuery): Promise<StockListResult>;
  listMovements(query: StockMovementListQuery): Promise<StockMovementListResult>;
  /** 全部非零库存批次（效期视图）：含 remainingDays/isExpired，按到期日升序。 */
  listBatches(query: StockBatchListQuery): Promise<StockBatchRecord[]>;
  /** 已过期批次（expiry_date < 今日 UTC，qty > 0）。 */
  listExpired(query: StockBatchListQuery): Promise<StockBatchRecord[]>;
}

/** 零售价行（retail_prices JOIN units/items + unit_cost 加权参考）。 */
export interface RetailPriceRecord {
  id: string;
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  price: string;
  currency: string;
  /** 入库加权平均进价（只读参考；无库存为 null）。 */
  unitCost: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: Date;
}

/** 零售价历史行（retail_price_history）。 */
export interface RetailPriceHistoryRecord {
  id: string;
  unitId: string;
  unitName: string | null;
  itemId: string;
  itemName: string | null;
  price: string;
  currency: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: Date;
}

export interface RetailPriceListQuery {
  unitId?: string;
  itemId?: string;
}

/** 零售价仓储（design.md §4.2）：upsert 当前价并写历史；无 unit_cost 写入口。 */
export interface RetailPriceRepository {
  list(query: RetailPriceListQuery): Promise<RetailPriceRecord[]>;
  /** 设置/更新零售价：写入 retail_prices（唯一 unit×item）+ retail_price_history。 */
  setPrice(input: {
    unitId: string;
    itemId: string;
    price: string;
    currency: string;
    updatedBy: string;
  }): Promise<RetailPriceRecord>;
  listHistory(unitId: string, itemId: string): Promise<RetailPriceHistoryRecord[]>;
}

/** 销售单行（sales_order_items JOIN items 展示字段）。 */
export interface SalesOrderItemRecord {
  id: string;
  salesOrderId: string;
  itemId: string;
  itemName: string | null;
  spec: string | null;
  qty: string;
  listPrice: string | null;
  price: string | null;
  lineTotal: string | null;
}

/** 销售批次分配行（sales_batch_allocations JOIN batches/items）。 */
export interface SalesBatchAllocationRecord {
  id: string;
  orderItemId: string;
  itemId: string;
  itemName: string | null;
  batchId: string;
  batchNo: string | null;
  expiryDate: string | null;
  qty: string;
}

/** 支付凭证行（payments）。 */
export interface PaymentRecord {
  id: string;
  salesOrderId: string;
  amount: string;
  currency: string;
  methodNote: string | null;
  proofFileId: string | null;
  refundNote: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
}

export interface SalesOrderRecord {
  id: string;
  salesNo: string;
  sellerUnitId: string;
  buyerUnitId: string;
  source: SalesSource;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string | null;
  freight: string;
  discountPercent: string;
  currency: string;
  totalAmount: string | null;
  status: SalesStatus;
  remark: string | null;
  sentAt: Date | null;
  confirmedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  hasPayment: boolean;
}

export interface SalesListQuery {
  page?: number;
  size?: number;
  status?: SalesStatus;
  /** 数据范围：买方或卖方单元（任一方匹配）。 */
  unitId?: string;
}

export interface SalesListResult {
  items: SalesOrderRecord[];
  total: number;
  page: number;
  size: number;
}

export interface CreateSalesItemInput {
  itemId: string;
  qty: string;
  unitPriceOverride: string | null;
}

export interface CreateSalesRepoInput {
  sellerUnitId: string;
  buyerUnitId: string;
  source: SalesSource;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string | null;
  freight: string;
  discountPercent: string;
  currency: string;
  remark: string | null;
  items: CreateSalesItemInput[];
  createdBy: string;
}

export interface PatchSalesInput {
  deliveryMethod?: DeliveryMethod;
  deliveryAddress?: string | null;
  freight?: string;
  discountPercent?: string;
  currency?: string;
  remark?: string | null;
  items?: CreateSalesItemInput[];
}

/** 发送时手工批次分配（覆盖 FEFO）：按 item 汇总 qty 必须等于行数量。 */
export interface SalesAllocationInput {
  itemId: string;
  batchId: string;
  qty: string;
}

export interface SalesOrderWithItemsRecord {
  order: SalesOrderRecord;
  items: SalesOrderItemRecord[];
}

/**
 * 销售单仓储（design.md §4.2 / §5.5）。
 * 金额快照由服务端计算；send/cancel 与库存扣减/回补同一事务；支付 upsert。
 */
export interface SalesRepository {
  list(query: SalesListQuery): Promise<SalesListResult>;
  findById(id: string): Promise<SalesOrderRecord | null>;
  listItems(salesOrderId: string): Promise<SalesOrderItemRecord[]>;
  listAllocations(salesOrderId: string): Promise<SalesBatchAllocationRecord[]>;
  findPayment(salesOrderId: string): Promise<PaymentRecord | null>;
  /** 新建 DRAFT 销售单：以当前零售价取 listPrice 快照，计算行价/合计。 */
  create(input: CreateSalesRepoInput): Promise<SalesOrderRecord>;
  /** 更新 DRAFT 销售单：行整体替换并重算快照；非 DRAFT 抛 SALES_STATE_CONFLICT。 */
  update(id: string, input: PatchSalesInput): Promise<SalesOrderRecord | null>;
  /**
   * 发送 DRAFT → SENT：FEFO（expiry_date ASC）或手工批次分配写
   * sales_batch_allocations，同一事务按批扣减 stock 并写 stock_movements（OUTBOUND_SALE）。
   * 非 DRAFT 抛 SALES_STATE_CONFLICT；库存不足抛 INSUFFICIENT_STOCK；
   * 手工批次不存在抛 STOCK_BATCH_NOT_FOUND。
   */
  send(id: string, allocations: SalesAllocationInput[], sentBy: string): Promise<SalesOrderRecord | null>;
  /**
   * 取消：DRAFT → CANCELLED（无库存动作）；SENT/PAYMENT_UPLOADED（未确认收货）→ CANCELLED，
   * 按原分配写 stock_movements（OUTBOUND_SALE_REVERSAL）回补批次。CONFIRMED 抛 SALES_STATE_CONFLICT。
   */
  cancel(id: string, cancelledBy: string): Promise<SalesOrderRecord | null>;
  /** 上传/更新支付凭证：SENT/PAYMENT_UPLOADED → PAYMENT_UPLOADED；其他状态抛 SALES_STATE_CONFLICT。 */
  uploadPayment(
    id: string,
    input: { amount: string; currency: string; methodNote: string | null; proofFileId: string | null; uploadedBy: string },
  ): Promise<PaymentRecord | null>;
  /** 确认收货：PAYMENT_UPLOADED → CONFIRMED；其他状态抛 SALES_STATE_CONFLICT。 */
  confirmReceipt(id: string, confirmedBy: string): Promise<SalesOrderRecord | null>;
}

/** 站内通知行（notifications，ck-08b 先写表，发送端 ck-10 联接）。 */
export interface NotificationRecord {
  id: string;
  userId: string | null;
  unitId: string | null;
  type: string;
  title: string;
  content: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationRepository {
  /** 写入站内通知（user_id 或 unit_id 至少其一，表约束兜底）。 */
  create(input: {
    userId?: string | null;
    unitId?: string | null;
    type: string;
    title: string;
    content?: string | null;
    link?: string | null;
  }): Promise<NotificationRecord>;
  /** 查询（按单元/用户过滤；ck-10 通知中心使用）。 */
  list(query?: { unitId?: string; userId?: string }): Promise<NotificationRecord[]>;
}

export interface Repos {
  users: UserRepository;
  units: UnitRepository;
  items: ItemRepository;
  files: FileRepository;
  shipments: ShipmentRepository;
  inbounds: InboundRepository;
  returns: ReturnRepository;
  outbounds: OutboundRepository;
  stock: StockRepository;
  retailPrices: RetailPriceRepository;
  sales: SalesRepository;
  notifications: NotificationRepository;
}

export interface AuthState {
  claims: TokenClaims;
  user: UserRecord | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthState;
    repos: Repos | null;
  };
};
