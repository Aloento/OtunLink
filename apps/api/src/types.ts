import type {
  ItemStatus,
  ShipmentStatus,
  SpecUnit,
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
}

export interface Repos {
  users: UserRepository;
  units: UnitRepository;
  items: ItemRepository;
  files: FileRepository;
  shipments: ShipmentRepository;
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
