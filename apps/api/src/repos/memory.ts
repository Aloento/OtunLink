import type {
  AuditLogListQuery,
  AuditLogListResult,
  AuditLogRecord,
  AuditLogRepository,
  ConfirmReceiptRepoInput,
  CreateFileInput,
  CreateInboundManualRepoInput,
  CreateItemInput,
  CreateOutboundRepoInput,
  CreatePartnershipInput,
  CreateReturnRepoInput,
  CreateReviewInput,
  CreateSalesRepoInput,
  CreateSalesReturnRepoInput,
  CreateShipmentInput,
  CreateUnitInput,
  CreateUserInput,
  DiscrepancyReviewItemRecord,
  DiscrepancyReviewRecord,
  EmailLogRecord,
  EmailLogRepository,
  FileRecord,
  FileRepository,
  InboundListQuery,
  InboundListResult,
  InboundOrderItemRecord,
  InboundOrderRecord,
  InboundRepository,
  ItemImageRecord,
  ItemListQuery,
  ItemListResult,
  ItemRecord,
  ItemRepository,
  OutboundListQuery,
  OutboundListResult,
  OutboundOrderItemRecord,
  OutboundOrderRecord,
  OutboundRepository,
  PartnershipListQuery,
  PartnershipRecord,
  PartnershipRepository,
  PatchSalesInput,
  PaymentRecord,
  Repos,
  ReturnListQuery,
  ReturnListResult,
  ReturnOrderItemRecord,
  ReturnOrderRecord,
  ReturnRepository,
  SalesAllocationInput,
  SalesBatchAllocationRecord,
  SalesListQuery,
  SalesListResult,
  SalesOrderItemRecord,
  SalesOrderRecord,
  SalesRepository,
  SalesReturnReceiveLineInput,
  SaveCountResult,
  ShipmentCountRepoInput,
  ShipmentItemRecord,
  ShipmentListQuery,
  ShipmentListResult,
  ShipmentRecord,
  ShipmentRepository,
  ShipmentTrackingRecord,
  NotificationRecord,
  NotificationRepository,
  NotificationVisibility,
  NotificationListResult,
  RetailPriceHistoryRecord,
  RetailPriceListQuery,
  RetailPriceRecord,
  RetailPriceRepository,
  StockBatchListQuery,
  StockBatchRecord,
  StockListQuery,
  StockListResult,
  StockMovementListQuery,
  StockMovementListResult,
  StockMovementRecord,
  StockRepository,
  StockRowRecord,
  UnitRecord,
  UnitRepository,
  UpdateItemInput,
  UpdateOutboundRepoInput,
  UpdateShipmentInput,
  UpdateUnitInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../types';
import { expiryRemainingDays, type UnitType } from '@otunlink/shared';
import { mergeInboundLines, qtyEqual, type MergedInboundLine } from './inbound-lines';
import { ensureBatchNo } from '../lib/batch';

// 内存实现：供单元测试/本地无 DB 联调使用；生产必须走 Drizzle（见 repos/sql.ts 注释）。

const uuid = () => crypto.randomUUID();

class MemoryUserRepository implements UserRepository {
  private rows = new Map<string, UserRecord>();

  constructor(seed: UserRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneUser(row));
  }

  async findByEntraSub(sub: string): Promise<UserRecord | null> {
    for (const row of this.rows.values()) {
      if (row.entraSub === sub) return cloneUser(row);
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneUser(row) : null;
  }

  async list(): Promise<UserRecord[]> {
    return [...this.rows.values()].map(cloneUser);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    if (await this.findByEntraSub(input.entraSub)) {
      throw new Error('用户已存在（entra_sub 冲突）');
    }
    const now = new Date();
    const row: UserRecord = {
      id: uuid(),
      entraSub: input.entraSub,
      email: input.email,
      name: input.name,
      role: input.role ?? null,
      scopeUnitId: input.scopeUnitId ?? null,
      status: input.status ?? 'PENDING',
      locale: input.locale ?? 'zh-CN',
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, cloneUser(row));
    return cloneUser(row);
  }

  async update(id: string, patch: UpdateUserInput): Promise<UserRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const next: UserRecord = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.scopeUnitId !== undefined ? { scopeUnitId: patch.scopeUnitId } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneUser(next));
    return cloneUser(next);
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

class MemoryUnitRepository implements UnitRepository {
  private rows = new Map<string, UnitRecord>();

  constructor(seed: UnitRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneUnit(row));
  }

  async findById(id: string): Promise<UnitRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneUnit(row) : null;
  }

  async list(
    opts: { includeInactive?: boolean; scopeUnitId?: string; type?: UnitType } = {},
  ): Promise<UnitRecord[]> {
    return [...this.rows.values()]
      .filter((row) => (opts.includeInactive ? true : row.isActive))
      .filter((row) => (opts.scopeUnitId ? row.id === opts.scopeUnitId : true))
      .filter((row) => (opts.type ? row.type === opts.type : true))
      .map(cloneUnit);
  }

  async create(input: CreateUnitInput): Promise<UnitRecord> {
    const now = new Date();
    const row: UnitRecord = {
      id: uuid(),
      code: input.code,
      name: input.name,
      type: input.type,
      address: input.address ?? null,
      contact: input.contact ?? null,
      timezone: input.timezone ?? 'UTC',
      baseCurrency: input.baseCurrency ?? 'CNY',
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, cloneUnit(row));
    return cloneUnit(row);
  }

  async update(id: string, patch: UpdateUnitInput): Promise<UnitRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const next: UnitRecord = {
      ...existing,
      ...(patch.code !== undefined ? { code: patch.code } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.contact !== undefined ? { contact: patch.contact } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.baseCurrency !== undefined ? { baseCurrency: patch.baseCurrency } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneUnit(next));
    return cloneUnit(next);
  }
}

function cloneUser(row: UserRecord): UserRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneUnit(row: UnitRecord): UnitRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

// 条码冲突信号：内存实现用消息前缀标记，路由层据此映射为 BARCODE_CONFLICT（409）。
const BARCODE_CONFLICT_MESSAGE = 'BARCODE_CONFLICT: barcode already taken by an ACTIVE item';

class MemoryItemRepository implements ItemRepository {
  private rows = new Map<string, ItemRecord>();
  private images = new Map<string, ItemImageRecord[]>();
  private referenceCheckers: ((itemId: string) => boolean)[] = [];

  constructor(seed: ItemRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneItem(row));
  }

  addReferenceChecker(checker: (itemId: string) => boolean): void {
    this.referenceCheckers.push(checker);
  }

  private assertBarcodeAvailable(barcode: string | null | undefined, excludeId?: string): void {
    if (!barcode) return;
    for (const row of this.rows.values()) {
      if (row.id !== excludeId && row.status === 'ACTIVE' && row.barcode === barcode) {
        throw new Error(BARCODE_CONFLICT_MESSAGE);
      }
    }
  }

  async findById(id: string): Promise<ItemRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneItem(row) : null;
  }

  async findByBarcode(code: string): Promise<ItemRecord | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    for (const row of this.rows.values()) {
      if (row.status === 'ACTIVE' && row.barcode === trimmed) return cloneItem(row);
    }
    return null;
  }

  async list(query: ItemListQuery): Promise<ItemListResult> {
    const q = query.q?.trim().toLowerCase();
    const category = query.category?.trim();
    const all = [...this.rows.values()]
      .filter((row) => {
        if (category && row.category?.trim() !== category) return false;
        if (!q) return true;
        return (
          row.name.toLowerCase().includes(q) ||
          (row.barcode?.toLowerCase().includes(q) ?? false) ||
          (row.sku?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const size = Math.min(Math.max(query.size ?? 50, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    const items = all.slice(start, start + size).map(cloneItem);
    return { items, total: all.length, page, size };
  }

  async listCategories(): Promise<string[]> {
    const counts = new Map<string, number>();
    for (const row of this.rows.values()) {
      const category = row.category?.trim();
      if (!category) continue;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category]) => category);
  }

  async create(input: CreateItemInput): Promise<ItemRecord> {
    this.assertBarcodeAvailable(input.barcode ?? null);
    const now = new Date();
    const hasManualSku = Boolean(input.sku?.trim());
    let sku = generateItemSku(input.sku, input.name);
    if (!hasManualSku) {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (![...this.rows.values()].some((row) => row.sku === sku)) break;
        sku = generateItemSku(null, input.name);
      }
    }
    const row: ItemRecord = {
      id: uuid(),
      sku,
      name: input.name,
      barcode: normalizeEmpty(input.barcode),
      specUnit: input.specUnit ?? 'PIECE',
      innerUnit: input.innerUnit ?? null,
      innerCount: normalizeEmpty(input.innerCount),
      isPerishable: input.isPerishable ?? false,
      category: normalizeEmpty(input.category),
      description: normalizeEmpty(input.description),
      status: input.status ?? 'ACTIVE',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, cloneItem(row));
    return cloneItem(row);
  }

  async update(id: string, patch: UpdateItemInput): Promise<ItemRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (patch.barcode !== undefined) {
      const nextBarcode = normalizeEmpty(patch.barcode);
      const nextStatus = patch.status ?? existing.status;
      if (nextStatus === 'ACTIVE') this.assertBarcodeAvailable(nextBarcode, id);
    }
    const next: ItemRecord = {
      ...existing,
      ...(patch.sku !== undefined ? { sku: normalizeEmpty(patch.sku) } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.barcode !== undefined ? { barcode: normalizeEmpty(patch.barcode) } : {}),
      ...(patch.specUnit !== undefined ? { specUnit: patch.specUnit } : {}),
      ...(patch.innerUnit !== undefined ? { innerUnit: normalizeEmpty(patch.innerUnit) } : {}),
      ...(patch.innerCount !== undefined ? { innerCount: normalizeEmpty(patch.innerCount) } : {}),
      ...(patch.isPerishable !== undefined ? { isPerishable: patch.isPerishable } : {}),
      ...(patch.category !== undefined ? { category: normalizeEmpty(patch.category) } : {}),
      ...(patch.description !== undefined ? { description: normalizeEmpty(patch.description) } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneItem(next));
    return cloneItem(next);
  }

  async listImages(itemId: string): Promise<ItemImageRecord[]> {
    return (this.images.get(itemId) ?? []).map(cloneItemImage);
  }

  async attachImages(itemId: string, fileIds: string[]): Promise<ItemImageRecord[]> {
    const existing = this.images.get(itemId) ?? [];
    let nextOrder = existing.reduce((max, img) => Math.max(max, img.sortOrder), 0);
    const added: ItemImageRecord[] = [];
    for (const fileId of fileIds) {
      nextOrder += 1;
      const record: ItemImageRecord = {
        id: uuid(),
        itemId,
        fileId,
        isPrimary: existing.length === 0 && added.length === 0,
        sortOrder: nextOrder,
        createdAt: new Date(),
      };
      added.push(record);
    }
    this.images.set(itemId, [...existing, ...added]);
    return (this.images.get(itemId) ?? []).map(cloneItemImage);
  }

  async hasReferences(id: string): Promise<boolean> {
    return this.referenceCheckers.some((check) => check(id));
  }

  async delete(id: string): Promise<boolean> {
    if (!this.rows.has(id)) return false;
    this.images.delete(id);
    return this.rows.delete(id);
  }
}

class MemoryFileRepository implements FileRepository {
  private rows = new Map<string, FileRecord>();

  constructor(seed: FileRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneFile(row));
  }

  async findById(id: string): Promise<FileRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneFile(row) : null;
  }

  async create(input: CreateFileInput): Promise<FileRecord> {
    const row: FileRecord = {
      id: uuid(),
      key: input.key,
      thumbnailKey: input.thumbnailKey,
      mime: input.mime,
      size: input.size,
      width: input.width,
      height: input.height,
      createdAt: new Date(),
    };
    this.rows.set(row.id, cloneFile(row));
    return cloneFile(row);
  }
}

const SKU_ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSkuCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SKU_ALPHANUM[Math.floor(Math.random() * SKU_ALPHANUM.length)];
  }
  return out;
}

function generateItemSku(raw: string | null | undefined, name: string): string {
  const candidate = raw?.trim();
  if (candidate && candidate.length > 0) return candidate;
  const alnum = String(name ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  const firstLetter = alnum.search(/[A-Z]/);
  if (firstLetter >= 0) {
    const base = alnum.slice(firstLetter).slice(0, 8);
    return `${base}-${randomSkuCode(6)}`;
  }
  return randomSkuCode(8);
}

function normalizeEmpty<T extends string>(value: T | null | undefined): T | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim() as T;
  return trimmed.length > 0 ? trimmed : null;
}

function cloneItem(row: ItemRecord): ItemRecord {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

function cloneItemImage(row: ItemImageRecord): ItemImageRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    ...(row.file ? { file: cloneFile(row.file) } : {}),
  };
}

function cloneFile(row: FileRecord): FileRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

// 物流单号 / 状态冲突信号：内存实现用消息前缀标记，路由层据此映射 409。
const TRACKING_CONFLICT_MESSAGE = 'TRACKING_CONFLICT: carrier+tracking_no already exists';
const SHIPMENT_STATE_MESSAGE = 'SHIPMENT_STATE_CONFLICT: only DRAFT shipments can be edited or sent';
// 点货/差异协商业务信号（路由层映射为对应错误码）。
const COUNTING_STATE_MESSAGE =
  'COUNTING_STATE_CONFLICT: shipment is not in a countable state or version mismatch';
const COUNT_LINE_INVALID_MESSAGE = 'COUNT_LINE_INVALID: count line does not belong to the shipment';
const REVIEW_ALREADY_PROCESSED_MESSAGE =
  'REVIEW_ALREADY_PROCESSED: review already processed or pending review exists';
const REVIEW_NO_DIFFERENCE_MESSAGE = 'REVIEW_NO_DIFFERENCE: no discrepancy to review';
// 确认入库 / 发货退货业务信号（路由层映射为对应错误码）。
const SHIPMENT_NOT_READY_MESSAGE = 'SHIPMENT_NOT_READY: shipment is not READY or lines mismatch';
const INBOUND_STATE_CONFLICT_MESSAGE = 'INBOUND_STATE_CONFLICT: only DRAFT inbound orders can be posted';
const RETURN_STATE_CONFLICT_MESSAGE = 'RETURN_STATE_CONFLICT: shipment is not READY for return';
const RETURN_ALREADY_PROCESSED_MESSAGE = 'RETURN_ALREADY_PROCESSED: return order already processed';
const RETURN_LINE_INVALID_MESSAGE = 'RETURN_LINE_INVALID: return line is invalid';
const RETURN_QTY_EXCEEDED_MESSAGE = 'RETURN_QTY_EXCEEDED: return qty exceeds returnable';
const OUTBOUND_STATE_CONFLICT_MESSAGE =
  'OUTBOUND_STATE_CONFLICT: only DRAFT outbound orders can be posted';
const INSUFFICIENT_STOCK_MESSAGE = 'INSUFFICIENT_STOCK: insufficient stock for outbound';
const STOCK_BATCH_NOT_FOUND_MESSAGE =
  'STOCK_BATCH_NOT_FOUND: no stock of the specified batch in the warehouse';
// 销售单业务信号（路由层映射为对应错误码）。
const SALES_STATE_CONFLICT_MESSAGE =
  'SALES_STATE_CONFLICT: sales order is not in the expected state';
const SALES_LINE_INVALID_MESSAGE = 'SALES_LINE_INVALID: sales order line is invalid';

type SalesLineIssueReason = 'NO_LIST_PRICE' | 'NO_BATCH_STOCK' | 'QTY_EXCEEDS_STOCK';
interface SalesLineIssue {
  index: number;
  itemId: string;
  itemName: string | null;
  reason: SalesLineIssueReason;
  message: string;
}
function errorWithLineDetails(message: string, issues: SalesLineIssue[]): Error {
  const err = new Error(message);
  (err as { details?: unknown }).details = { lines: issues };
  return err;
}

/** 单据编号 ：SH-YYYYMMDD-XXXX（UTC 日期 + 4 位当日序号）。 */
function shipmentNoDate(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

class MemoryShipmentRepository implements ShipmentRepository {
  private rows = new Map<string, ShipmentRecord>();
  private trackings = new Map<string, ShipmentTrackingRecord[]>();
  private items = new Map<string, ShipmentItemRecord[]>();
  private reviews = new Map<string, DiscrepancyReviewRecord>();
  private reviewItems = new Map<string, DiscrepancyReviewItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  constructor(
    seed: {
      shipments?: ShipmentRecord[];
      trackings?: ShipmentTrackingRecord[];
      items?: ShipmentItemRecord[];
      reviews?: DiscrepancyReviewRecord[];
    } = {},
  ) {
    for (const row of seed.shipments ?? []) this.rows.set(row.id, cloneShipment(row));
    for (const row of seed.trackings ?? []) {
      const list = this.trackings.get(row.shipmentId) ?? [];
      list.push(cloneShipmentTracking(row));
      this.trackings.set(row.shipmentId, list);
    }
    for (const row of seed.items ?? []) {
      const list = this.items.get(row.shipmentId) ?? [];
      list.push(cloneShipmentItem(row));
      this.items.set(row.shipmentId, list);
    }
    for (const row of seed.reviews ?? []) {
      this.reviews.set(row.id, cloneReview(row));
      if (row.items) this.reviewItems.set(row.id, row.items.map(cloneReviewItem));
    }
  }

  private nextShipmentNo(): string {
    const key = shipmentNoDate(new Date());
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `SH-${key}-${String(next).padStart(4, '0')}`;
  }

  private assertTrackingsAvailable(
    trackings: CreateShipmentInput['trackings'],
    excludeShipmentId?: string,
  ): void {
    for (const incoming of trackings) {
      for (const [shipmentId, rows] of this.trackings) {
        if (shipmentId === excludeShipmentId) continue;
        for (const row of rows) {
          if (row.carrier === incoming.carrier && row.trackingNo === incoming.trackingNo) {
            throw new Error(TRACKING_CONFLICT_MESSAGE);
          }
        }
      }
    }
  }

  async findById(id: string): Promise<ShipmentRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneShipment(row) : null;
  }

  async findByNo(no: string): Promise<ShipmentRecord | null> {
    for (const row of this.rows.values()) {
      if (row.shipmentNo === no) return cloneShipment(row);
    }
    return null;
  }

  async list(query: ShipmentListQuery): Promise<ShipmentListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) =>
        query.scopeUnitId
          ? row.shipperUnitId === query.scopeUnitId || row.receiverUnitId === query.scopeUnitId
          : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return {
      items: all.slice(start, start + size).map(cloneShipment),
      total: all.length,
      page,
      size,
    };
  }

  async create(input: CreateShipmentInput): Promise<ShipmentRecord> {
    this.assertTrackingsAvailable(input.trackings);
    const now = new Date();
    const row: ShipmentRecord = {
      id: uuid(),
      shipmentNo: this.nextShipmentNo(),
      shipperUnitId: input.shipperUnitId,
      receiverUnitId: input.receiverUnitId,
      status: 'DRAFT',
      boxesCount: input.boxesCount,
      currency: input.currency,
      expectedArrivalDate: normalizeEmpty(input.expectedArrivalDate),
      remark: normalizeEmpty(input.remark),
      sentAt: null,
      createdBy: input.createdBy,
      countVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, cloneShipment(row));

    this.trackings.set(
      row.id,
      input.trackings.map((t) => ({
        id: uuid(),
        shipmentId: row.id,
        carrier: t.carrier,
        trackingNo: t.trackingNo,
        note: normalizeEmpty(t.note),
        createdAt: now,
      })),
    );
    this.items.set(
      row.id,
      input.items.map((i) => ({
        id: uuid(),
        shipmentId: row.id,
        itemId: i.itemId,
        name: i.name,
        spec: normalizeEmpty(i.spec),
        expectedQty: i.expectedQty,
        actualQty: null,
        unitPrice: normalizeEmpty(i.unitPrice),
        productionDate: normalizeEmpty(i.productionDate),
        expiryDate: normalizeEmpty(i.expiryDate),
        lineNote: normalizeEmpty(i.lineNote),
        createdAt: now,
        updatedAt: now,
      })),
    );
    return cloneShipment(row);
  }

  async update(id: string, patch: UpdateShipmentInput): Promise<ShipmentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_MESSAGE);

    if (patch.trackings) this.assertTrackingsAvailable(patch.trackings, id);

    const next: ShipmentRecord = {
      ...existing,
      ...(patch.shipperUnitId !== undefined ? { shipperUnitId: patch.shipperUnitId } : {}),
      ...(patch.receiverUnitId !== undefined ? { receiverUnitId: patch.receiverUnitId } : {}),
      ...(patch.boxesCount !== undefined ? { boxesCount: patch.boxesCount } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.expectedArrivalDate !== undefined
        ? { expectedArrivalDate: normalizeEmpty(patch.expectedArrivalDate) }
        : {}),
      ...(patch.remark !== undefined ? { remark: normalizeEmpty(patch.remark) } : {}),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneShipment(next));

    if (patch.trackings) {
      const now = new Date();
      this.trackings.set(
        id,
        patch.trackings.map((t) => ({
          id: uuid(),
          shipmentId: id,
          carrier: t.carrier,
          trackingNo: t.trackingNo,
          note: normalizeEmpty(t.note),
          createdAt: now,
        })),
      );
    }
    if (patch.items) {
      const now = new Date();
      this.items.set(
        id,
        patch.items.map((i) => ({
          id: uuid(),
          shipmentId: id,
          itemId: i.itemId,
          name: i.name,
          spec: normalizeEmpty(i.spec),
          expectedQty: i.expectedQty,
          actualQty: null,
          unitPrice: normalizeEmpty(i.unitPrice),
          productionDate: normalizeEmpty(i.productionDate),
          expiryDate: normalizeEmpty(i.expiryDate),
          lineNote: normalizeEmpty(i.lineNote),
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    return cloneShipment(next);
  }

  async send(id: string): Promise<ShipmentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_MESSAGE);
    const next: ShipmentRecord = {
      ...existing,
      status: 'SENT',
      sentAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneShipment(next));
    return cloneShipment(next);
  }

  async listTrackings(shipmentId: string): Promise<ShipmentTrackingRecord[]> {
    return (this.trackings.get(shipmentId) ?? []).map(cloneShipmentTracking);
  }

  async listTrackingsForShipments(ids: string[]): Promise<Map<string, ShipmentTrackingRecord[]>> {
    const map = new Map<string, ShipmentTrackingRecord[]>();
    for (const id of ids) {
      map.set(id, (this.trackings.get(id) ?? []).map(cloneShipmentTracking));
    }
    return map;
  }

  async listItems(shipmentId: string): Promise<ShipmentItemRecord[]> {
    return (this.items.get(shipmentId) ?? []).map(cloneShipmentItem);
  }

  async startCounting(id: string): Promise<ShipmentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'SENT') throw new Error(COUNTING_STATE_MESSAGE);
    const next: ShipmentRecord = {
      ...existing,
      status: 'COUNTING',
      updatedAt: new Date(),
    };
    this.rows.set(id, cloneShipment(next));
    return cloneShipment(next);
  }

  async saveCount(id: string, input: ShipmentCountRepoInput): Promise<SaveCountResult | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'COUNTING' && existing.status !== 'DISCREPANCY') {
      throw new Error(COUNTING_STATE_MESSAGE);
    }
    if (existing.countVersion !== input.version) throw new Error(COUNTING_STATE_MESSAGE);

    const shipmentItems = this.items.get(id) ?? [];
    const byId = new Map(shipmentItems.map((it) => [it.id, it]));
    const nextItems = shipmentItems.map((it) => {
      const line = input.lines.find((l) => l.shipmentItemId === it.id);
      if (!line) return it;
      return {
        ...it,
        actualQty: line.actualQty === '' ? null : line.actualQty,
        updatedAt: new Date(),
      };
    });
    const cloneById = new Map(nextItems.map((it) => [it.id, it]));
    for (const line of input.lines) {
      if (!cloneById.has(line.shipmentItemId)) throw new Error(COUNT_LINE_INVALID_MESSAGE);
      if (!byId.has(line.shipmentItemId)) throw new Error(COUNT_LINE_INVALID_MESSAGE);
    }

    let hasDifference = false;
    let allCounted = true;
    for (const it of nextItems) {
      const actualEmpty = it.actualQty === null || it.actualQty === '';
      if (actualEmpty) {
        allCounted = false;
      } else if (compareQty(it.actualQty, it.expectedQty) !== 0) {
        hasDifference = true;
      }
    }
    const status = hasDifference ? 'DISCREPANCY' : allCounted ? 'READY' : 'COUNTING';

    const next: ShipmentRecord = {
      ...existing,
      status,
      countVersion: existing.countVersion + 1,
      updatedAt: new Date(),
    };
    this.items.set(id, nextItems);
    this.rows.set(id, cloneShipment(next));
    return { shipment: cloneShipment(next), countVersion: next.countVersion };
  }

  async createReview(input: CreateReviewInput): Promise<DiscrepancyReviewRecord> {
    const shipment = this.rows.get(input.shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    const pending = [...this.reviews.values()].find(
      (r) => r.shipmentId === input.shipmentId && r.status === 'PENDING',
    );
    if (shipment.status !== 'DISCREPANCY') {
      if (pending) throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);
      throw new Error(REVIEW_NO_DIFFERENCE_MESSAGE);
    }
    if (pending) throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);

    const shipmentItems = this.items.get(input.shipmentId) ?? [];
    const byId = new Map(shipmentItems.map((it) => [it.id, it]));
    let hasDifference = false;
    const now = new Date();
    const itemRows: DiscrepancyReviewItemRecord[] = input.lines.map((line) => {
      const item = byId.get(line.shipmentItemId);
      if (!item) throw new Error(COUNT_LINE_INVALID_MESSAGE);
      if (item.actualQty === null || item.actualQty === '' || compareQty(item.actualQty, item.expectedQty) === 0) {
        throw new Error(REVIEW_NO_DIFFERENCE_MESSAGE);
      }
      hasDifference = true;
      return {
        id: uuid(),
        reviewId: '', // review id 在下方创建后统一赋值
        shipmentItemId: line.shipmentItemId,
        expectedQtyBefore: item.expectedQty ?? '0',
        actualQty: line.actualQty,
        reason: normalizeEmpty(line.reason),
      };
    });
    if (!hasDifference) throw new Error(REVIEW_NO_DIFFERENCE_MESSAGE);

    const review: DiscrepancyReviewRecord = {
      id: uuid(),
      shipmentId: input.shipmentId,
      status: 'PENDING',
      reason: normalizeEmpty(input.reason),
      photoFileIds: [...input.photoFileIds],
      submittedBy: input.submittedBy,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const finalItems = itemRows.map((r) => ({ ...r, reviewId: review.id }));
    this.reviewItems.set(review.id, finalItems);
    this.reviews.set(review.id, cloneReview(review));

    this.rows.set(
      input.shipmentId,
      cloneShipment({ ...shipment, status: 'REVIEW_PENDING', updatedAt: now }),
    );
    return { ...cloneReview(review), items: finalItems };
  }

  async listReviews(shipmentId: string): Promise<DiscrepancyReviewRecord[]> {
    const list = [...this.reviews.values()]
      .filter((r) => r.shipmentId === shipmentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list.map((r) => ({ ...cloneReview(r), items: this.reviewItemsFor(r.id) }));
  }

  private reviewItemsFor(reviewId: string): DiscrepancyReviewItemRecord[] {
    return (this.reviewItems.get(reviewId) ?? []).map(cloneReviewItem);
  }

  async findReview(id: string): Promise<DiscrepancyReviewRecord | null> {
    const review = this.reviews.get(id);
    if (!review) return null;
    return { ...cloneReview(review), items: this.reviewItemsFor(id) };
  }

  async approveReview(id: string, reviewedBy: string | null): Promise<DiscrepancyReviewRecord | null> {
    const review = this.reviews.get(id);
    if (!review) return null;
    if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);
    const now = new Date();
    const nextReview: DiscrepancyReviewRecord = {
      ...review,
      status: 'APPROVED',
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    };
    this.reviews.set(id, cloneReview(nextReview));

    const shipment = this.rows.get(review.shipmentId);
    if (shipment) {
      const rows = (this.items.get(shipment.id) ?? []).map((it) => {
        const reviewItem = this.reviewItemsFor(id).find((ri) => ri.shipmentItemId === it.id);
        if (!reviewItem) return it;
        return { ...it, expectedQty: reviewItem.actualQty, updatedAt: now };
      });
      this.items.set(shipment.id, rows);
      this.rows.set(
        shipment.id,
        cloneShipment({ ...shipment, status: 'READY', updatedAt: now }),
      );
    }
    return { ...cloneReview(nextReview), items: this.reviewItemsFor(id) };
  }

  async rejectReview(
    id: string,
    reviewedBy: string | null,
    reason: string,
  ): Promise<DiscrepancyReviewRecord | null> {
    const review = this.reviews.get(id);
    if (!review) return null;
    if (review.status !== 'PENDING') throw new Error(REVIEW_ALREADY_PROCESSED_MESSAGE);
    const now = new Date();
    const nextReview: DiscrepancyReviewRecord = {
      ...review,
      status: 'REJECTED',
      reason,
      reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    };
    this.reviews.set(id, cloneReview(nextReview));

    const shipment = this.rows.get(review.shipmentId);
    if (shipment) {
      this.rows.set(
        shipment.id,
        cloneShipment({ ...shipment, status: 'DISCREPANCY', updatedAt: now }),
      );
    }
    return { ...cloneReview(nextReview), items: this.reviewItemsFor(id) };
  }

  /** 内部状态流转：入库/退货仓储复用，直接覆盖发货单状态。 */
  transitionTo(id: string, status: ShipmentRecord['status']): void {
    const shipment = this.rows.get(id);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    this.rows.set(id, cloneShipment({ ...shipment, status, updatedAt: new Date() }));
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing) return false;
    if (existing.status !== 'DRAFT') throw new Error(SHIPMENT_STATE_MESSAGE);
    // 手动级联删除子表（DB 已 ON DELETE CASCADE）。
    for (const reviewId of [...this.reviews.keys()]) {
      if (this.reviews.get(reviewId)?.shipmentId === id) {
        this.reviews.delete(reviewId);
        this.reviewItems.delete(reviewId);
      }
    }
    this.trackings.delete(id);
    this.items.delete(id);
    return this.rows.delete(id);
  }
}

function cloneShipment(row: ShipmentRecord): ShipmentRecord {
  return {
    ...row,
    sentAt: row.sentAt ? new Date(row.sentAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneShipmentTracking(row: ShipmentTrackingRecord): ShipmentTrackingRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function cloneShipmentItem(row: ShipmentItemRecord): ShipmentItemRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneReviewItem(row: DiscrepancyReviewItemRecord): DiscrepancyReviewItemRecord {
  return { ...row };
}

function cloneReview(row: DiscrepancyReviewRecord): DiscrepancyReviewRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

// ── 内存实现：确认入库 + 发货退货。 ────────────────────────────────────

/** 供测试断言用的内存批次快照。 */
export interface MemoryBatchRecord {
  id: string;
  itemId: string;
  batchNo: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  sourceType: string;
  sourceOrderId: string | null;
  createdBy: string | null;
}

/** 供测试断言用的内存库存快照。 */
export interface MemoryStockRecord {
  unitId: string;
  itemId: string;
  batchId: string;
  qty: number;
  avgCost: number;
  version: number;
  updatedAt: Date;
}

/** 供测试断言用的内存台账快照。 */
export interface MemoryStockMovementRecord {
  unitId: string;
  itemId: string;
  batchId: string;
  type: string;
  qtyDelta: number;
  qtyBefore: number;
  qtyAfter: number;
  unitCost: number;
  orderType: string;
  orderId: string;
  refNo: string;
  operatorId: string | null;
  createdAt: Date;
}

/**
 * 共享内存台账：batches / stock / movements 三个 Map 供入库、
 * 出库、库存查询三个仓储共用，保证测试/联调时数据一致。
 */
class MemoryStockLedger {
  readonly batches = new Map<string, MemoryBatchRecord>();
  readonly stock = new Map<string, MemoryStockRecord>();
  readonly movements: MemoryStockMovementRecord[] = [];

  stockKey(unitId: string, itemId: string, batchId: string): string {
    return `${unitId}|${itemId}|${batchId}`;
  }

  /** 入库：建档批次 + 库存（加权平均成本）+ 台账流水。 */
  applyInbound(params: {
    unitId: string;
    itemId: string;
    batch: MemoryBatchRecord;
    qty: number;
    unitCost: number;
    type: string;
    orderType: string;
    orderId: string;
    refNo: string;
    operatorId: string | null;
  }): void {
    const { unitId, itemId } = params;
    const now = new Date();
    this.batches.set(params.batch.id, { ...params.batch });
    const key = this.stockKey(unitId, itemId, params.batch.id);
    const before = this.stock.get(key);
    const qtyBefore = before ? before.qty : 0;
    const qtyAfter = qtyBefore + params.qty;
    const avgCost =
      qtyAfter > 0
        ? (qtyBefore * (before ? before.avgCost : 0) + params.qty * params.unitCost) / qtyAfter
        : 0;
    this.stock.set(key, {
      unitId,
      itemId,
      batchId: params.batch.id,
      qty: round2(qtyAfter),
      avgCost: round2(avgCost),
      version: (before ? before.version : 0) + 1,
      updatedAt: now,
    });
    this.movements.push({
      unitId,
      itemId,
      batchId: params.batch.id,
      type: params.type,
      qtyDelta: round2(params.qty),
      qtyBefore: round2(qtyBefore),
      qtyAfter: round2(qtyAfter),
      unitCost: params.unitCost,
      orderType: params.orderType,
      orderId: params.orderId,
      refNo: params.refNo,
      operatorId: params.operatorId,
      createdAt: now,
    });
  }

  /**
   * 出库扣减：batchId 缺省按 FEFO（到期日 → 生产日期升序）自动分配（可拆多批）；
   * 指定批次则须存在且数量足够。逐批写台账流水并返回分配明细。
   * 库存不足抛 INSUFFICIENT_STOCK；指定批次无库存抛 STOCK_BATCH_NOT_FOUND。
   */
  applyOutbound(params: {
    unitId: string;
    itemId: string;
    qty: number;
    batchId: string | null;
    type: string;
    orderType: string;
    orderId: string;
    refNo: string;
    operatorId: string | null;
  }): { batchId: string; qty: number; unitCost: number }[] {
    const keyOf = (batchId: string) => this.stockKey(params.unitId, params.itemId, batchId);
    const candidates = [...this.stock.values()]
      .filter((row) => row.unitId === params.unitId && row.itemId === params.itemId && row.qty > 0)
      .sort((a, b) => {
        const ea = this.batches.get(a.batchId)?.expiryDate ?? null;
        const eb = this.batches.get(b.batchId)?.expiryDate ?? null;
        if (ea !== eb) return (ea ?? '9999-12-31') < (eb ?? '9999-12-31') ? -1 : 1;
        const pa = this.batches.get(a.batchId)?.productionDate ?? null;
        const pb = this.batches.get(b.batchId)?.productionDate ?? null;
        if (pa !== pb) return (pa ?? '9999-12-31') < (pb ?? '9999-12-31') ? -1 : 1;
        return a.batchId < b.batchId ? -1 : a.batchId > b.batchId ? 1 : 0;
      });

    const now = new Date();
    const allocations: { batchId: string; qty: number; unitCost: number }[] = [];
    const consume = (row: MemoryStockRecord, qty: number) => {
      const qtyAfter = round2(row.qty - qty);
      if (qtyAfter < 0) throw new Error(INSUFFICIENT_STOCK_MESSAGE);
      this.stock.set(keyOf(row.batchId), {
        ...row,
        qty: qtyAfter,
        version: row.version + 1,
        updatedAt: now,
      });
      this.movements.push({
        unitId: params.unitId,
        itemId: params.itemId,
        batchId: row.batchId,
        type: params.type,
        qtyDelta: -round2(qty),
        qtyBefore: round2(row.qty),
        qtyAfter,
        unitCost: row.avgCost,
        orderType: params.orderType,
        orderId: params.orderId,
        refNo: params.refNo,
        operatorId: params.operatorId,
        createdAt: now,
      });
      allocations.push({ batchId: row.batchId, qty: round2(qty), unitCost: row.avgCost });
    };

    if (params.batchId) {
      const row = this.stock.get(keyOf(params.batchId));
      if (!row || row.qty < params.qty) {
        throw new Error(
          row && row.qty >= 0 ? INSUFFICIENT_STOCK_MESSAGE : STOCK_BATCH_NOT_FOUND_MESSAGE,
        );
      }
      consume(row, params.qty);
      return allocations;
    }

    const total = candidates.reduce((sum, row) => sum + row.qty, 0);
    if (round2(total) < params.qty) throw new Error(INSUFFICIENT_STOCK_MESSAGE);
    let remaining = params.qty;
    for (const row of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, row.qty);
      consume(row, take);
      remaining = round2(remaining - take);
    }
    return allocations;
  }
}

function cloneInbound(row: InboundOrderRecord): InboundOrderRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    postedAt: row.postedAt ? new Date(row.postedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneInboundItem(row: InboundOrderItemRecord): InboundOrderItemRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function cloneReturn(row: ReturnOrderRecord): ReturnOrderRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneReturnItem(row: ReturnOrderItemRecord): ReturnOrderItemRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function cloneOutbound(row: OutboundOrderRecord): OutboundOrderRecord {
  return {
    ...row,
    photoFileIds: [...row.photoFileIds],
    postedAt: row.postedAt ? new Date(row.postedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneOutboundItem(row: OutboundOrderItemRecord): OutboundOrderItemRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

class MemoryInboundRepository implements InboundRepository {
  private rows = new Map<string, InboundOrderRecord>();
  private items = new Map<string, InboundOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  /** 测试可检查的批次 / 库存 / 台账快照（委托共享台账）。 */
  get batches(): Map<string, MemoryBatchRecord> {
    return this.ledger.batches;
  }
  get stock(): Map<string, MemoryStockRecord> {
    return this.ledger.stock;
  }
  get movements(): MemoryStockMovementRecord[] {
    return this.ledger.movements;
  }

  constructor(
    private readonly shipmentRepo: MemoryShipmentRepository,
    private readonly itemRepo: ItemRepository,
    seed: { inbounds?: InboundOrderRecord[]; inboundItems?: InboundOrderItemRecord[] } = {},
    private readonly ledger: MemoryStockLedger = new MemoryStockLedger(),
  ) {
    for (const row of seed.inbounds ?? []) this.rows.set(row.id, cloneInbound(row));
    for (const row of seed.inboundItems ?? []) {
      const list = this.items.get(row.inboundOrderId) ?? [];
      list.push(cloneInboundItem(row));
      this.items.set(row.inboundOrderId, list);
    }
  }

  private nextInboundNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `IB-${key}-${String(next).padStart(4, '0')}`;
  }

  /** 非易腐物品的生产/到期日清空为 null；易腐物品原样保留。 */
  private async perishableDates(
    itemId: string,
    productionDate: string | null,
    expiryDate: string | null,
  ): Promise<{ productionDate: string | null; expiryDate: string | null }> {
    const item = await this.itemRepo.findById(itemId);
    return item && item.isPerishable
      ? { productionDate, expiryDate }
      : { productionDate: null, expiryDate: null };
  }

  /** 新建手动入库单（sourceType=MANUAL, DRAFT）。 */
  async createManual(input: CreateInboundManualRepoInput): Promise<InboundOrderRecord> {
    const now = new Date();
    const inbound: InboundOrderRecord = {
      id: uuid(),
      inboundNo: this.nextInboundNo(),
      sourceType: 'MANUAL',
      shipmentId: null,
      warehouseUnitId: input.warehouseUnitId,
      counterpartyUnitId: normalizeEmpty(input.counterpartyUnitId),
      status: 'DRAFT',
      remark: normalizeEmpty(input.remark),
      photoFileIds: [...input.photoFileIds],
      postedBy: null,
      postedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(inbound.id, cloneInbound(inbound));
    const itemRows: InboundOrderItemRecord[] = [];
    for (const line of input.lines) {
      const dates = await this.perishableDates(
        line.itemId,
        normalizeEmpty(line.productionDate),
        normalizeEmpty(line.expiryDate),
      );
      itemRows.push({
        id: uuid(),
        inboundOrderId: inbound.id,
        itemId: line.itemId,
        batchId: null,
        qty: line.qty,
        unitCost: line.unitCost ?? '0',
        lineNote: normalizeEmpty(line.lineNote),
        productionDate: dates.productionDate,
        expiryDate: dates.expiryDate,
        batchNo: normalizeEmpty(line.batchNo),
        createdAt: now,
      });
    }
    this.items.set(inbound.id, itemRows.map(cloneInboundItem));
    return cloneInbound(inbound);
  }

  /**
   * 内部入库建档：按 qtyFor 计算各发货行入库数量 → mergeInboundLines 归并 →
   * 建 DRAFT 入库单 + 明细；并（可选）翻转发货单状态。partial（部分退货剩余）不翻转。
   */
  private async createDraftFromShipment(params: {
    shipment: ShipmentRecord;
    shipmentItems: ShipmentItemRecord[];
    qtyFor: (item: ShipmentItemRecord) => string | null;
    batchNoFor: (item: ShipmentItemRecord) => string | null;
    createdBy: string;
    remark: string | null;
    photoFileIds: string[];
    flipShipmentStatus: boolean;
  }): Promise<InboundOrderRecord> {
    const merged = mergeInboundLines(
      params.shipmentItems,
      params.qtyFor,
      params.batchNoFor,
      params.shipment.shipmentNo,
    );
    if (merged.length === 0) throw new Error(SHIPMENT_NOT_READY_MESSAGE);

    const now = new Date();
    const inbound: InboundOrderRecord = {
      id: uuid(),
      inboundNo: this.nextInboundNo(),
      sourceType: 'SHIPMENT',
      shipmentId: params.shipment.id,
      warehouseUnitId: params.shipment.receiverUnitId,
      counterpartyUnitId: params.shipment.shipperUnitId,
      status: 'DRAFT',
      remark: normalizeEmpty(params.remark),
      photoFileIds: [...params.photoFileIds],
      postedBy: null,
      postedAt: null,
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(inbound.id, cloneInbound(inbound));
    const itemRows: InboundOrderItemRecord[] = [];
    for (const line of merged) {
      const dates = await this.perishableDates(
        line.itemId,
        normalizeEmpty(line.productionDate),
        normalizeEmpty(line.expiryDate),
      );
      itemRows.push({
        id: uuid(),
        inboundOrderId: inbound.id,
        itemId: line.itemId,
        batchId: null,
        qty: line.qty,
        unitCost: line.unitCost,
        lineNote: null,
        productionDate: dates.productionDate,
        expiryDate: dates.expiryDate,
        batchNo: normalizeEmpty(line.batchNo),
        createdAt: now,
      });
    }
    this.items.set(inbound.id, itemRows.map(cloneInboundItem));

    if (params.flipShipmentStatus) {
      this.shipmentRepo.transitionTo(inbound.shipmentId!, 'INBOUNDED');
    }
    return cloneInbound(inbound);
  }

  async list(query: InboundListQuery): Promise<InboundListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) => (query.warehouseUnitId ? row.warehouseUnitId === query.warehouseUnitId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return { items: all.slice(start, start + size).map(cloneInbound), total: all.length, page, size };
  }

  async findById(id: string): Promise<InboundOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneInbound(row) : null;
  }

  async listItems(inboundOrderId: string): Promise<InboundOrderItemRecord[]> {
    return (this.items.get(inboundOrderId) ?? []).map(cloneInboundItem);
  }

  async confirmReceipt(
    shipmentId: string,
    input: ConfirmReceiptRepoInput,
  ): Promise<InboundOrderRecord> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    if (shipment.status !== 'READY') throw new Error(SHIPMENT_NOT_READY_MESSAGE);

    const shipmentItems = await this.shipmentRepo.listItems(shipmentId);
    if (shipmentItems.length === 0) throw new Error(SHIPMENT_NOT_READY_MESSAGE);
    for (const item of shipmentItems) {
      if (!item.itemId) throw new Error(SHIPMENT_NOT_READY_MESSAGE);
      if (item.actualQty === null || item.actualQty === '' || !qtyEqual(item.actualQty, item.expectedQty)) {
        throw new Error(SHIPMENT_NOT_READY_MESSAGE);
      }
    }
    const validIds = new Set(shipmentItems.map((i) => i.id));
    for (const line of input.lines) {
      if (!validIds.has(line.shipmentItemId)) throw new Error(SHIPMENT_NOT_READY_MESSAGE);
    }
    const batchNoByItem = new Map(input.lines.map((l) => [l.shipmentItemId, l.batchNo ?? null]));

    return this.createDraftFromShipment({
      shipment,
      shipmentItems,
      qtyFor: (item) => item.actualQty,
      batchNoFor: (item) => batchNoByItem.get(item.id) ?? null,
      createdBy: input.createdBy,
      remark: input.remark,
      photoFileIds: input.photoFileIds,
      flipShipmentStatus: true,
    });
  }

  /** 部分退货接受时，按剩余数量建档 DRAFT 入库单（不翻转发货单状态）。 */
  async confirmReceiptRemainder(
    shipmentId: string,
    qtyFor: (item: ShipmentItemRecord) => string | null,
    createdBy: string,
  ): Promise<InboundOrderRecord | null> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) return null;
    const shipmentItems = await this.shipmentRepo.listItems(shipmentId);
    const merged = mergeInboundLines(shipmentItems, qtyFor, () => null, shipment.shipmentNo);
    if (merged.length === 0) return null;
    return this.createDraftFromShipment({
      shipment,
      shipmentItems,
      qtyFor,
      batchNoFor: () => null,
      createdBy,
      remark: null,
      photoFileIds: [],
      flipShipmentStatus: false,
    });
  }

  async post(id: string, postedBy: string): Promise<InboundOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(INBOUND_STATE_CONFLICT_MESSAGE);

    const now = new Date();
    const itemRows: InboundOrderItemRecord[] = [];
    for (const row of this.items.get(id) ?? []) {
      const dates = await this.perishableDates(row.itemId, row.productionDate, row.expiryDate);
      const batch: MemoryBatchRecord = {
        id: uuid(),
        itemId: row.itemId,
        batchNo: ensureBatchNo(row.itemId, row.batchNo),
        productionDate: dates.productionDate,
        expiryDate: dates.expiryDate,
        sourceType: existing.sourceType,
        sourceOrderId: existing.shipmentId,
        createdBy: postedBy,
      };
      this.ledger.applyInbound({
        unitId: existing.warehouseUnitId,
        itemId: row.itemId,
        batch,
        qty: Number(row.qty),
        unitCost: Number(row.unitCost),
        type: existing.sourceType === 'MANUAL' ? 'INBOUND_MANUAL' : 'INBOUND_SHIPMENT',
        orderType: 'inbound',
        orderId: existing.id,
        refNo: existing.inboundNo,
        operatorId: postedBy,
      });
      itemRows.push({ ...row, batchId: batch.id });
    }
    this.items.set(id, itemRows.map(cloneInboundItem));

    const next: InboundOrderRecord = {
      ...existing,
      status: 'POSTED',
      postedBy,
      postedAt: now,
      updatedAt: now,
    };
    this.rows.set(id, cloneInbound(next));
    return cloneInbound(next);
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing) return false;
    if (existing.status !== 'DRAFT') throw new Error(INBOUND_STATE_CONFLICT_MESSAGE);
    this.items.delete(id);
    return this.rows.delete(id);
  }
}

class MemoryReturnRepository implements ReturnRepository {
  private rows = new Map<string, ReturnOrderRecord>();
  private items = new Map<string, ReturnOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly shipmentRepo: MemoryShipmentRepository,
    private readonly inboundRepo: MemoryInboundRepository,
    private readonly salesRepo: MemorySalesRepository,
    private readonly ledger: MemoryStockLedger,
    seed: { returns?: ReturnOrderRecord[]; returnItems?: ReturnOrderItemRecord[] } = {},
  ) {
    for (const row of seed.returns ?? []) this.rows.set(row.id, cloneReturn(row));
    for (const row of seed.returnItems ?? []) {
      const list = this.items.get(row.returnOrderId) ?? [];
      list.push(cloneReturnItem(row));
      this.items.set(row.returnOrderId, list);
    }
  }

  private nextReturnNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `RT-${key}-${String(next).padStart(4, '0')}`;
  }

  async list(query: ReturnListQuery): Promise<ReturnListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) => (query.sourceType ? row.sourceType === query.sourceType : true))
      .filter((row) => (query.salesOrderId ? row.salesOrderId === query.salesOrderId : true))
      .filter((row) =>
        query.scopeUnitId
          ? row.fromUnitId === query.scopeUnitId || row.toUnitId === query.scopeUnitId
          : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return { items: all.slice(start, start + size).map(cloneReturn), total: all.length, page, size };
  }

  async findById(id: string): Promise<ReturnOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneReturn(row) : null;
  }

  async listItems(returnOrderId: string): Promise<ReturnOrderItemRecord[]> {
    return (this.items.get(returnOrderId) ?? []).map((row) => {
      const batch = row.originalBatchId ? this.ledger.batches.get(row.originalBatchId) : undefined;
      return cloneReturnItem({
        ...row,
        pendingQc: batch?.sourceType === 'RETURNS_PENDING',
      });
    });
  }

  async createReturn(input: CreateReturnRepoInput): Promise<ReturnOrderRecord> {
    const shipment = await this.shipmentRepo.findById(input.shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    if (shipment.status !== 'READY') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);

    const shipmentItems = await this.shipmentRepo.listItems(shipment.id);
    const byId = new Map(shipmentItems.map((i) => [i.id, i]));
    const lines: { shipmentItemId: string; itemId: string; qty: string; reason: string | null }[] = [];
    for (const line of input.lines) {
      const item = byId.get(line.shipmentItemId);
      if (!item || !item.itemId) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0 || qty > Number(item.expectedQty)) {
        throw new Error(RETURN_LINE_INVALID_MESSAGE);
      }
      lines.push({
        shipmentItemId: item.id,
        itemId: item.itemId,
        qty: qty.toFixed(2),
        reason: normalizeEmpty(line.reason),
      });
    }
    if (lines.length === 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);

    const now = new Date();
    const order: ReturnOrderRecord = {
      id: uuid(),
      returnNo: this.nextReturnNo(),
      sourceType: 'SHIPMENT',
      shipmentId: shipment.id,
      salesOrderId: null,
      fromUnitId: shipment.receiverUnitId,
      toUnitId: shipment.shipperUnitId,
      status: 'PENDING',
      reason: normalizeEmpty(input.reason),
      note: normalizeEmpty(input.note),
      photoFileIds: [...input.photoFileIds],
      returnCarrier: normalizeEmpty(input.returnCarrier),
      returnTrackingNo: normalizeEmpty(input.returnTrackingNo),
      createdBy: input.createdBy,
      processedBy: null,
      processedAt: null,
      processedNote: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(order.id, cloneReturn(order));
    const itemRows: ReturnOrderItemRecord[] = lines.map((line) => ({
      id: uuid(),
      returnOrderId: order.id,
      itemId: line.itemId,
      shipmentItemId: line.shipmentItemId,
      salesOrderItemId: null,
      qty: line.qty,
      receivedQty: null,
      originalBatchId: null,
      reason: line.reason,
      createdAt: now,
    }));
    this.items.set(order.id, itemRows.map(cloneReturnItem));

    this.shipmentRepo.transitionTo(shipment.id, 'RETURN_PENDING');
    return cloneReturn(order);
  }

  async accept(
    id: string,
    processedBy: string,
    note: string | null,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);
    if (!order.shipmentId) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    const shipment = await this.shipmentRepo.findById(order.shipmentId);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');

    const returnItems = (this.items.get(id) ?? []).map(cloneReturnItem);
    const shipmentItems = await this.shipmentRepo.listItems(shipment.id);
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
      (si) => si.itemId !== null && (returnedByShipmentItem.get(si.id) ?? 0) >= Number(si.expectedQty),
    );

    let shipmentStatus: 'RETURNED' | 'INBOUNDED';
    if (fullReturn) {
      shipmentStatus = 'RETURNED';
    } else {
      await this.inboundRepo.confirmReceiptRemainder(
        shipment.id,
        (si) => {
          const returned = returnedByShipmentItem.get(si.id) ?? 0;
          const remaining = Number(si.expectedQty) - returned;
          return remaining > 0 ? remaining.toFixed(2) : null;
        },
        processedBy,
      );
      shipmentStatus = 'INBOUNDED';
    }

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'CLOSED',
      processedBy,
      processedAt: now,
      processedNote: normalizeEmpty(note),
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    this.shipmentRepo.transitionTo(shipment.id, shipmentStatus);
    return cloneReturn(next);
  }

  async reject(id: string, processedBy: string, note: string): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.status !== 'PENDING') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'REJECTED',
      processedBy,
      processedAt: now,
      processedNote: note,
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    if (order.shipmentId) {
      this.shipmentRepo.transitionTo(order.shipmentId, 'READY');
    }
    return cloneReturn(next);
  }

  // ── 零售售后退货（source_type=SALES）────────────────────────────────
  async createFromSales(input: CreateSalesReturnRepoInput): Promise<ReturnOrderRecord> {
    const order = await this.salesRepo.findById(input.salesOrderId);
    if (!order) throw new Error('SALES_NOT_FOUND: sales order does not exist');
    if (
      order.status !== 'SENT' &&
      order.status !== 'PAYMENT_UPLOADED' &&
      order.status !== 'CONFIRMED'
    ) {
      throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    }

    const lines = await this.salesRepo.listItems(order.id);
    const byId = new Map(lines.map((l) => [l.id, l]));
    const returnedByLine = new Map<string, number>();
    for (const [returnId, itemRows] of this.items) {
      const ro = this.rows.get(returnId);
      if (!ro || ro.sourceType !== 'SALES' || ro.status === 'CANCELLED') continue;
      for (const ri of itemRows) {
        if (!ri.salesOrderItemId) continue;
        returnedByLine.set(
          ri.salesOrderItemId,
          (returnedByLine.get(ri.salesOrderItemId) ?? 0) + Number(ri.qty),
        );
      }
    }

    // 行级合并（同一销售行允许多行，汇总后校验）。
    const requested = new Map<string, { qty: number; reason: string | null }>();
    for (const l of input.lines) {
      const item = byId.get(l.salesOrderItemId);
      if (!item) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const qty = Number(l.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const prev = requested.get(item.id) ?? { qty: 0, reason: null };
      requested.set(item.id, {
        qty: round2(prev.qty + qty),
        reason: normalizeEmpty(l.reason) ?? prev.reason,
      });
    }
    if (requested.size === 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);
    const finalLines: { salesOrderItemId: string; itemId: string; qty: string; reason: string | null }[] = [];
    for (const [lineId, req] of requested) {
      const item = byId.get(lineId)!;
      const returnable = round2(Number(item.qty) - (returnedByLine.get(lineId) ?? 0));
      if (req.qty > returnable + 1e-9) throw new Error(RETURN_QTY_EXCEEDED_MESSAGE);
      finalLines.push({
        salesOrderItemId: item.id,
        itemId: item.itemId,
        qty: req.qty.toFixed(2),
        reason: req.reason,
      });
    }

    const now = new Date();
    const record: ReturnOrderRecord = {
      id: uuid(),
      returnNo: this.nextReturnNo(),
      sourceType: 'SALES',
      shipmentId: null,
      salesOrderId: order.id,
      fromUnitId: order.buyerUnitId,
      toUnitId: order.sellerUnitId,
      status: 'REQUESTED',
      reason: normalizeEmpty(input.reason),
      note: normalizeEmpty(input.note),
      photoFileIds: [...input.photoFileIds],
      returnCarrier: null,
      returnTrackingNo: null,
      createdBy: input.createdBy,
      processedBy: null,
      processedAt: null,
      processedNote: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, cloneReturn(record));
    this.items.set(
      record.id,
      finalLines.map<ReturnOrderItemRecord>((line) => ({
        id: uuid(),
        returnOrderId: record.id,
        itemId: line.itemId,
        shipmentItemId: null,
        salesOrderItemId: line.salesOrderItemId,
        qty: line.qty,
        receivedQty: null,
        originalBatchId: null,
        reason: line.reason,
        createdAt: now,
      })),
    );
    return cloneReturn(record);
  }

  async approveSales(
    id: string,
    processedBy: string,
    note: string | null,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    if (order.status !== 'REQUESTED') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'APPROVED',
      processedBy,
      processedAt: now,
      processedNote: normalizeEmpty(note),
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    return cloneReturn(next);
  }

  async rejectSales(
    id: string,
    processedBy: string,
    note: string,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    if (order.status !== 'REQUESTED') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);

    const now = new Date();
    const next: ReturnOrderRecord = {
      ...order,
      status: 'CANCELLED',
      processedBy,
      processedAt: now,
      processedNote: note,
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    return cloneReturn(next);
  }

  async receive(
    id: string,
    receivedBy: string,
    lines: SalesReturnReceiveLineInput[],
    note: string | null,
  ): Promise<ReturnOrderRecord | null> {
    const order = this.rows.get(id);
    if (!order) return null;
    if (order.sourceType !== 'SALES') throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    if (order.status !== 'APPROVED') throw new Error(RETURN_ALREADY_PROCESSED_MESSAGE);
    const salesOrder = order.salesOrderId ? await this.salesRepo.findById(order.salesOrderId) : null;
    if (!salesOrder) throw new Error('SALES_NOT_FOUND: sales order does not exist');

    const returnItems = (this.items.get(id) ?? []).map(cloneReturnItem);
    const byId = new Map(returnItems.map((i) => [i.id, i]));

    // 校验：每行实收数量 0 ≤ receivedQty ≤ 申请数量；所有退货行必须录入。
    const receivedByItem = new Map<string, number>();
    for (const line of lines) {
      const item = byId.get(line.returnItemId);
      if (!item) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      const rqty = Number(line.receivedQty);
      if (!Number.isFinite(rqty) || rqty < 0) throw new Error(RETURN_LINE_INVALID_MESSAGE);
      if (rqty > Number(item.qty) + 1e-9) throw new Error(RETURN_QTY_EXCEEDED_MESSAGE);
      receivedByItem.set(item.id, round2((receivedByItem.get(item.id) ?? 0) + rqty));
    }
    if (receivedByItem.size !== returnItems.length) throw new Error(RETURN_LINE_INVALID_MESSAGE);
    for (const [itemId, total] of receivedByItem) {
      const item = byId.get(itemId)!;
      if (total > Number(item.qty) + 1e-9) throw new Error(RETURN_QTY_EXCEEDED_MESSAGE);
    }

    // 原批次 unit_cost 快照（取该销售单 OUTBOUND_SALE 流水，按批次取最新一条）。
    const unitCostByBatch = new Map<string, number>();
    for (const m of this.ledger.movements) {
      if (
        m.orderType === 'sales' &&
        m.orderId === salesOrder.id &&
        m.type === 'OUTBOUND_SALE' &&
        !unitCostByBatch.has(m.batchId)
      ) {
        unitCostByBatch.set(m.batchId, m.unitCost);
      }
    }

    // 按销售行分配记录确定原批次（按分配顺序依次回补，量不足则转待检批次）。
    const allocations = await this.salesRepo.listAllocations(salesOrder.id);
    const allocByItem = new Map<string, { batchId: string; qty: number }[]>();
    for (const a of allocations) {
      const list = allocByItem.get(a.orderItemId) ?? [];
      list.push({ batchId: a.batchId, qty: Number(a.qty) });
      allocByItem.set(a.orderItemId, list);
    }

    const ensurePendingBatch = (itemId: string): string => {
      const existing = [...this.ledger.batches.values()].find(
        (b) =>
          b.itemId === itemId &&
          b.sourceType === 'RETURNS_PENDING' &&
          b.productionDate === null &&
          b.expiryDate === null,
      );
      if (existing) return existing.id;
      const batchId = uuid();
      this.ledger.batches.set(batchId, {
        id: batchId,
        itemId,
        batchNo: ensureBatchNo(itemId, null),
        productionDate: null,
        expiryDate: null,
        sourceType: 'RETURNS_PENDING',
        sourceOrderId: order.id,
        createdBy: receivedBy,
      });
      return batchId;
    };

    const replenish = (itemId: string, batchId: string, rqty: number, unitCost: number) => {
      const key = this.ledger.stockKey(salesOrder.sellerUnitId, itemId, batchId);
      const before = this.ledger.stock.get(key);
      const qtyBefore = before ? before.qty : 0;
      const qtyAfter = round2(qtyBefore + rqty);
      this.ledger.stock.set(key, {
        unitId: salesOrder.sellerUnitId,
        itemId,
        batchId,
        qty: qtyAfter,
        avgCost: before ? before.avgCost : unitCost,
        version: (before ? before.version : 0) + 1,
        updatedAt: new Date(),
      });
      this.ledger.movements.push({
        unitId: salesOrder.sellerUnitId,
        itemId,
        batchId,
        type: 'RETURN_IN',
        qtyDelta: round2(rqty),
        qtyBefore: round2(qtyBefore),
        qtyAfter,
        unitCost,
        orderType: 'sales',
        orderId: salesOrder.id,
        refNo: order.returnNo,
        operatorId: receivedBy,
        createdAt: new Date(),
      });
    };

    const now = new Date();
    const nextItems = (this.items.get(id) ?? []).map(cloneReturnItem);
    for (const item of nextItems) {
      const rqty = receivedByItem.get(item.id) ?? 0;
      if (rqty <= 0) continue;
      let remaining = rqty;
      const allocs = item.salesOrderItemId ? (allocByItem.get(item.salesOrderItemId) ?? []) : [];
      const targets: { batchId: string; qty: number; unitCost: number }[] = [];
      for (const alloc of allocs) {
        if (remaining <= 0) break;
        const take = Math.min(alloc.qty, remaining);
        targets.push({
          batchId: alloc.batchId,
          qty: take,
          unitCost: unitCostByBatch.get(alloc.batchId) ?? 0,
        });
        remaining = round2(remaining - take);
      }
      if (remaining > 0) {
        targets.push({ batchId: ensurePendingBatch(item.itemId), qty: remaining, unitCost: 0 });
      }
      for (const target of targets) {
        replenish(item.itemId, target.batchId, target.qty, target.unitCost);
      }
      item.receivedQty = rqty.toFixed(2);
      item.originalBatchId = targets[0]?.batchId ?? null;
    }
    this.items.set(id, nextItems);

    const next: ReturnOrderRecord = {
      ...order,
      status: 'RETURNED',
      processedBy: receivedBy,
      processedAt: now,
      processedNote: normalizeEmpty(note),
      updatedAt: now,
    };
    this.rows.set(id, cloneReturn(next));
    return cloneReturn(next);
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const order = this.rows.get(id);
    if (!order) return false;
    if (order.status !== 'PENDING' && order.status !== 'REQUESTED') {
      throw new Error(RETURN_STATE_CONFLICT_MESSAGE);
    }
    // SHIPMENT 来源且 PENDING：回退关联发货单 RETURN_PENDING → READY。
    if (order.sourceType === 'SHIPMENT' && order.status === 'PENDING' && order.shipmentId) {
      const shipment = await this.shipmentRepo.findById(order.shipmentId);
      if (shipment && shipment.status === 'RETURN_PENDING') {
        this.shipmentRepo.transitionTo(order.shipmentId, 'READY');
      }
    }
    this.items.delete(id);
    return this.rows.delete(id);
  }
}

// ── 内存实现：手动出入库 + 库存台账。 ──────────────────────────────────

class MemoryOutboundRepository implements OutboundRepository {
  private rows = new Map<string, OutboundOrderRecord>();
  private items = new Map<string, OutboundOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly ledger: MemoryStockLedger,
    seed: { outbounds?: OutboundOrderRecord[]; outboundItems?: OutboundOrderItemRecord[] } = {},
  ) {
    for (const row of seed.outbounds ?? []) this.rows.set(row.id, cloneOutbound(row));
    for (const row of seed.outboundItems ?? []) {
      const list = this.items.get(row.outboundOrderId) ?? [];
      list.push(cloneOutboundItem(row));
      this.items.set(row.outboundOrderId, list);
    }
  }

  private nextOutboundNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `OB-${key}-${String(next).padStart(4, '0')}`;
  }

  async list(query: OutboundListQuery): Promise<OutboundListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) => (query.type ? row.type === query.type : true))
      .filter((row) => (query.warehouseUnitId ? row.warehouseUnitId === query.warehouseUnitId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return { items: all.slice(start, start + size).map(cloneOutbound), total: all.length, page, size };
  }

  async findById(id: string): Promise<OutboundOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? cloneOutbound(row) : null;
  }

  async listItems(outboundOrderId: string): Promise<OutboundOrderItemRecord[]> {
    return (this.items.get(outboundOrderId) ?? []).map(cloneOutboundItem);
  }

  async create(input: CreateOutboundRepoInput): Promise<OutboundOrderRecord> {
    const now = new Date();
    const order: OutboundOrderRecord = {
      id: uuid(),
      outboundNo: this.nextOutboundNo(),
      type: input.type ?? 'NORMAL',
      warehouseUnitId: input.warehouseUnitId,
      counterpartyUnitId: normalizeEmpty(input.counterpartyUnitId),
      status: 'DRAFT',
      lossReason: input.lossReason ?? null,
      photoFileIds: [...input.photoFileIds],
      remark: normalizeEmpty(input.remark),
      postedBy: null,
      postedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(order.id, cloneOutbound(order));
    this.items.set(
      order.id,
      input.lines.map((line) => ({
        id: uuid(),
        outboundOrderId: order.id,
        itemId: line.itemId,
        batchId: line.batchId ?? null,
        qty: line.qty,
        unitCost: null,
        createdAt: now,
      })).map(cloneOutboundItem),
    );
    return cloneOutbound(order);
  }

  async update(
    id: string,
    input: UpdateOutboundRepoInput,
  ): Promise<OutboundOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT_MESSAGE);
    const now = new Date();
    const next: OutboundOrderRecord = {
      ...existing,
      type: input.type ?? 'NORMAL',
      warehouseUnitId: input.warehouseUnitId,
      counterpartyUnitId: normalizeEmpty(input.counterpartyUnitId),
      lossReason: input.lossReason ?? null,
      photoFileIds: [...input.photoFileIds],
      remark: normalizeEmpty(input.remark),
      updatedAt: now,
    };
    this.rows.set(id, cloneOutbound(next));
    this.items.set(
      id,
      input.lines.map((line) => ({
        id: uuid(),
        outboundOrderId: id,
        itemId: line.itemId,
        batchId: line.batchId ?? null,
        qty: line.qty,
        unitCost: null,
        createdAt: now,
      })).map(cloneOutboundItem),
    );
    return cloneOutbound(next);
  }

  async post(id: string, postedBy: string): Promise<OutboundOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT_MESSAGE);

    const now = new Date();
    const allocated: OutboundOrderItemRecord[] = [];
    // 报损（type=LOSS）→ OUTBOUND_LOSS 流水；手工出库 → OUTBOUND_NORMAL。
    const movementType = existing.type === 'LOSS' ? 'OUTBOUND_LOSS' : 'OUTBOUND_NORMAL';
    for (const line of this.items.get(id) ?? []) {
      const qty = Number(line.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(INSUFFICIENT_STOCK_MESSAGE);
      // FEFO 自动分配（line.batchId 缺省）或指定批次；可能拆分为多行。
      const allocations = this.ledger.applyOutbound({
        unitId: existing.warehouseUnitId,
        itemId: line.itemId,
        qty,
        batchId: line.batchId,
        type: movementType,
        orderType: 'outbound',
        orderId: existing.id,
        refNo: existing.outboundNo,
        operatorId: postedBy,
      });
      for (const alloc of allocations) {
        allocated.push({
          id: uuid(),
          outboundOrderId: existing.id,
          itemId: line.itemId,
          batchId: alloc.batchId,
          qty: alloc.qty.toFixed(2),
          unitCost: alloc.unitCost.toFixed(2),
          createdAt: now,
        });
      }
    }
    this.items.set(id, allocated.map(cloneOutboundItem));

    const next: OutboundOrderRecord = {
      ...existing,
      status: 'POSTED',
      postedBy,
      postedAt: now,
      updatedAt: now,
    };
    this.rows.set(id, cloneOutbound(next));
    return cloneOutbound(next);
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing) return false;
    if (existing.status !== 'DRAFT') throw new Error(OUTBOUND_STATE_CONFLICT_MESSAGE);
    this.items.delete(id);
    return this.rows.delete(id);
  }
}

class MemoryStockRepository implements StockRepository {
  constructor(
    private readonly ledger: MemoryStockLedger,
    private readonly unitRepo: MemoryUnitRepository,
    private readonly itemRepo: MemoryItemRepository,
  ) {}

  private async hydrate(row: MemoryStockRecord): Promise<StockRowRecord> {
    const [unit, item, batch] = await Promise.all([
      this.unitRepo.findById(row.unitId),
      this.itemRepo.findById(row.itemId),
      Promise.resolve(this.ledger.batches.get(row.batchId) ?? null),
    ]);
    return {
      unitId: row.unitId,
      unitName: unit?.name ?? null,
      itemId: row.itemId,
      itemName: item?.name ?? null,
      spec: item?.specUnit ?? null,
      batchId: row.batchId,
      batchNo: batch?.batchNo ?? null,
      productionDate: batch?.productionDate ?? null,
      expiryDate: batch?.expiryDate ?? null,
      qty: String(row.qty),
      avgCost: String(row.avgCost),
      version: row.version,
      updatedAt: row.updatedAt,
    };
  }

  private async hydrateBatches(rows: MemoryStockRecord[]): Promise<StockBatchRecord[]> {
    const items: StockBatchRecord[] = [];
    for (const row of rows) {
      const base = await this.hydrate(row);
      const remainingDays = expiryRemainingDays(base.expiryDate, new Date());
      items.push({ ...base, remainingDays, isExpired: remainingDays !== null && remainingDays < 0 });
    }
    return items;
  }

  async list(query: StockListQuery): Promise<StockListResult> {
    const rows = [...this.ledger.stock.values()]
      .filter((row) => row.qty > 0)
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .filter((row) => (query.batchId ? row.batchId === query.batchId : true))
      .sort((a, b) =>
        `${a.unitId}|${a.itemId}|${a.batchId}`.localeCompare(`${b.unitId}|${b.itemId}|${b.batchId}`),
      );
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    const items: StockRowRecord[] = [];
    for (const row of rows.slice(start, start + size)) {
      items.push(await this.hydrate(row));
    }
    return { items, total: rows.length, page, size };
  }

  async listBatches(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
    const rows = [...this.ledger.stock.values()]
      .filter((row) => row.qty > 0)
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .sort((a, b) => {
        const ea = this.ledger.batches.get(a.batchId)?.expiryDate ?? '9999-12-31';
        const eb = this.ledger.batches.get(b.batchId)?.expiryDate ?? '9999-12-31';
        return ea.localeCompare(eb) || `${a.unitId}|${a.itemId}`.localeCompare(`${b.unitId}|${b.itemId}`);
      });
    return this.hydrateBatches(rows);
  }

  async listExpired(query: StockBatchListQuery): Promise<StockBatchRecord[]> {
    const all = await this.listBatches(query);
    return all.filter((row) => row.isExpired);
  }

  async listMovements(query: StockMovementListQuery): Promise<StockMovementListResult> {
    const filtered = this.ledger.movements
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .filter((row) => (query.batchId ? row.batchId === query.batchId : true))
      .reverse();
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    const items: StockMovementRecord[] = [];
    for (const row of filtered.slice(start, start + size)) {
      const [unit, item, batch] = await Promise.all([
        this.unitRepo.findById(row.unitId),
        this.itemRepo.findById(row.itemId),
        Promise.resolve(this.ledger.batches.get(row.batchId) ?? null),
      ]);
      items.push({
        id: `${row.orderType}:${row.orderId}:${row.batchId}:${row.operatorId ?? ''}:${row.createdAt.getTime()}`,
        unitId: row.unitId,
        unitName: unit?.name ?? null,
        itemId: row.itemId,
        itemName: item?.name ?? null,
        spec: item?.specUnit ?? null,
        batchId: row.batchId,
        batchNo: batch?.batchNo ?? null,
        type: row.type as StockMovementRecord['type'],
        qtyDelta: String(row.qtyDelta),
        qtyBefore: String(row.qtyBefore),
        qtyAfter: String(row.qtyAfter),
        unitCost: String(row.unitCost),
        orderType: row.orderType,
        orderId: row.orderId,
        refNo: row.refNo,
        note: null,
        operatorId: row.operatorId,
        createdAt: row.createdAt,
      });
    }
    return { items, total: filtered.length, page, size };
  }
}

// ── 内存实现：零售价 + 站内通知。 ──────────────────────────────────────

/** 内存零售价仓储：持有当前价 + 历史；unit_cost 只读（从台账加权平均计算）。 */
class MemoryRetailPriceRepository implements RetailPriceRepository {
  private prices = new Map<string, RetailPriceRecord>();
  private history: RetailPriceHistoryRecord[] = [];

  constructor(
    private readonly ledger: MemoryStockLedger,
    private readonly unitRepo: MemoryUnitRepository,
    private readonly itemRepo: MemoryItemRepository,
    private readonly userRepo: MemoryUserRepository,
  ) {}

  private key(unitId: string, itemId: string): string {
    return `${unitId}|${itemId}`;
  }

  /** 入库加权平均进价（只读参考）：SUM(qty*avg_cost)/SUM(qty)，无库存为 null。 */
  private unitCostOf(unitId: string, itemId: string): string | null {
    const rows = [...this.ledger.stock.values()].filter(
      (row) => row.unitId === unitId && row.itemId === itemId && row.qty > 0,
    );
    const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
    if (totalQty <= 0) return null;
    const totalCost = rows.reduce((sum, row) => sum + row.qty * row.avgCost, 0);
    return round2(totalCost / totalQty).toFixed(2);
  }

  async list(query: RetailPriceListQuery): Promise<RetailPriceRecord[]> {
    const rows = [...this.prices.values()]
      .filter((row) =>
        query.unitId
          ? row.unitId === query.unitId
          : query.unitIds
            ? query.unitIds.includes(row.unitId)
            : true,
      )
      .filter((row) => (query.itemId ? row.itemId === query.itemId : true))
      .sort((a, b) =>
        `${a.unitName ?? ''}|${a.itemName ?? ''}|${a.itemId}`.localeCompare(
          `${b.unitName ?? ''}|${b.itemName ?? ''}|${b.itemId}`,
        ),
      );
    return rows.map((row) => ({ ...row, unitCost: this.unitCostOf(row.unitId, row.itemId) }));
  }

  async setPrice(input: {
    unitId: string;
    itemId: string;
    price: string;
    currency: string;
    updatedBy: string;
  }): Promise<RetailPriceRecord> {
    const [unit, item, user] = await Promise.all([
      this.unitRepo.findById(input.unitId),
      this.itemRepo.findById(input.itemId),
      this.userRepo.findById(input.updatedBy),
    ]);
    const now = new Date();
    const existing = this.prices.get(this.key(input.unitId, input.itemId));
    const record: RetailPriceRecord = {
      id: existing?.id ?? uuid(),
      unitId: input.unitId,
      unitName: unit?.name ?? null,
      itemId: input.itemId,
      itemName: item?.name ?? null,
      spec: item?.specUnit ?? null,
      price: input.price,
      currency: input.currency,
      unitCost: this.unitCostOf(input.unitId, input.itemId),
      updatedBy: input.updatedBy,
      updatedByName: user?.name ?? null,
      updatedAt: now,
    };
    this.prices.set(this.key(input.unitId, input.itemId), { ...record });
    this.history.push({
      id: uuid(),
      unitId: input.unitId,
      unitName: record.unitName,
      itemId: input.itemId,
      itemName: record.itemName,
      price: input.price,
      currency: input.currency,
      updatedBy: input.updatedBy,
      updatedByName: record.updatedByName,
      updatedAt: now,
    });
    return { ...record };
  }

  async listHistory(unitId: string, itemId: string): Promise<RetailPriceHistoryRecord[]> {
    return this.history
      .filter((row) => row.unitId === unitId && row.itemId === itemId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((row) => ({ ...row }));
  }

  referencesItem(itemId: string): boolean {
    for (const row of this.prices.values()) {
      if (row.itemId === itemId) return true;
    }
    return false;
  }
}

/** 内存站内通知仓储（只写； 通知中心使用）。 */
class MemoryNotificationRepository implements NotificationRepository {
  private rows: NotificationRecord[] = [];

  async create(input: {
    userId?: string | null;
    unitId?: string | null;
    type: string;
    title: string;
    content?: string | null;
    link?: string | null;
  }): Promise<NotificationRecord> {
    const row: NotificationRecord = {
      id: uuid(),
      userId: input.userId ?? null,
      unitId: input.unitId ?? null,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      link: input.link ?? null,
      readAt: null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async list(query?: { unitId?: string; userId?: string }): Promise<NotificationRecord[]> {
    return this.rows
      .filter((row) => (query?.unitId ? row.unitId === query.unitId : true))
      .filter((row) => (query?.userId ? row.userId === query.userId : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({ ...row }));
  }

  /** 可见范围：本人或所在单元（scope 为空 = 全部单元通知）。 */
  private visible(scope: NotificationVisibility): (row: NotificationRecord) => boolean {
    return (row) =>
      row.userId === scope.userId || (scope.unitId ? row.unitId === scope.unitId : row.unitId !== null);
  }

  async listForUser(
    scope: NotificationVisibility,
    query?: { page?: number; size?: number; unreadOnly?: boolean },
  ): Promise<NotificationListResult> {
    const size = Math.min(Math.max(query?.size ?? 20, 1), 50);
    const page = Math.max(query?.page ?? 1, 1);
    const filtered = this.rows
      .filter(this.visible(scope))
      .filter((row) => (query?.unreadOnly ? row.readAt === null : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (page - 1) * size;
    return {
      items: filtered.slice(start, start + size).map((row) => ({ ...row })),
      total: filtered.length,
      page,
      size,
    };
  }

  async countUnread(scope: NotificationVisibility): Promise<number> {
    return this.rows.filter(this.visible(scope)).filter((row) => row.readAt === null).length;
  }

  async markRead(scope: NotificationVisibility, ids: string[]): Promise<number> {
    const idSet = new Set(ids);
    let updated = 0;
    for (const row of this.rows) {
      if (!idSet.has(row.id)) continue;
      if (!this.visible(scope)(row)) continue;
      if (row.readAt === null) {
        row.readAt = new Date();
        updated += 1;
      }
    }
    return updated;
  }
}

/** 内存邮件日志仓储。 */
class MemoryEmailLogRepository implements EmailLogRepository {
  private rows = new Map<string, EmailLogRecord>();

  async create(input: {
    toAddress: string;
    subject?: string | null;
    body?: string | null;
    provider?: string | null;
  }): Promise<EmailLogRecord> {
    const row: EmailLogRecord = {
      id: uuid(),
      toAddress: input.toAddress,
      subject: input.subject ?? null,
      body: input.body ?? null,
      status: 'PENDING',
      provider: input.provider ?? null,
      error: null,
      attempts: 0,
      sentAt: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async markResult(
    id: string,
    input: { status: 'SENT' | 'FAILED'; error?: string | null; sentAt?: Date | null; attempts?: number },
  ): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.status = input.status;
    row.error = input.error ?? null;
    if (input.sentAt) row.sentAt = input.sentAt;
    if (input.attempts !== undefined) row.attempts = input.attempts;
  }
}

/** 内存审计日志仓储（审计）。 */
class MemoryAuditLogRepository implements AuditLogRepository {
  private rows: AuditLogRecord[] = [];

  async create(input: {
    userId?: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  }): Promise<AuditLogRecord> {
    const row: AuditLogRecord = {
      id: uuid(),
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async list(query?: AuditLogListQuery): Promise<AuditLogListResult> {
    const size = Math.min(Math.max(query?.size ?? 20, 1), 50);
    const page = Math.max(query?.page ?? 1, 1);
    const filtered = this.rows
      .filter((row) => (query?.entityType ? row.entityType === query.entityType : true))
      .filter((row) => (query?.entityId ? row.entityId === query.entityId : true))
      .filter((row) => (query?.actorId ? row.userId === query.actorId : true))
      .filter((row) => (query?.from ? row.createdAt >= new Date(query.from) : true))
      .filter((row) => (query?.to ? row.createdAt <= new Date(`${query.to}T23:59:59.999Z`) : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (page - 1) * size;
    return {
      items: filtered.slice(start, start + size).map((row) => ({ ...row })),
      total: filtered.length,
      page,
      size,
    };
  }
}

function cloneSalesOrder(row: SalesOrderRecord): SalesOrderRecord {
  return {
    ...row,
    sentAt: row.sentAt ? new Date(row.sentAt) : null,
    confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function cloneSalesItem(row: SalesOrderItemRecord): SalesOrderItemRecord {
  return { ...row };
}

function clonePayment(row: PaymentRecord): PaymentRecord {
  return { ...row, uploadedAt: new Date(row.uploadedAt) };
}

/**
 * 内存销售单仓储：价格快照来自零售价（retailRepo），
 * 发送/取消复用共享台账（ledger.applyOutbound / 直接回补），与 SQL 实现行为对齐。
 */
class MemorySalesRepository implements SalesRepository {
  private rows = new Map<string, SalesOrderRecord>();
  private items = new Map<string, SalesOrderItemRecord[]>();
  private allocRows: SalesBatchAllocationRecord[] = [];
  private payments = new Map<string, PaymentRecord>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly ledger: MemoryStockLedger,
    private readonly retailRepo: MemoryRetailPriceRepository,
    private readonly unitRepo: MemoryUnitRepository,
    private readonly itemRepo: MemoryItemRepository,
    seed: {
      salesOrders?: SalesOrderRecord[];
      salesItems?: SalesOrderItemRecord[];
      salesAllocations?: SalesBatchAllocationRecord[];
      payments?: PaymentRecord[];
    } = {},
  ) {
    for (const row of seed.salesOrders ?? []) this.rows.set(row.id, cloneSalesOrder(row));
    for (const row of seed.salesItems ?? []) {
      const list = this.items.get(row.salesOrderId) ?? [];
      list.push(cloneSalesItem(row));
      this.items.set(row.salesOrderId, list);
    }
    for (const row of seed.salesAllocations ?? []) this.allocRows.push({ ...row });
    for (const row of seed.payments ?? []) this.payments.set(row.salesOrderId, clonePayment(row));
  }

  private withPayment(row: SalesOrderRecord): SalesOrderRecord {
    return { ...cloneSalesOrder(row), hasPayment: this.payments.has(row.id) || row.hasPayment };
  }

  private nextSalesNo(): string {
    const key = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const next = (this.dailyCounters.get(key) ?? 0) + 1;
    this.dailyCounters.set(key, next);
    return `SO-${key}-${String(next).padStart(4, '0')}`;
  }

  /** 价格快照：override ?? 当前零售价；二者皆无则行价/小计置 null（发送时校验）。 */
  private async snapshotLines(
    sellerUnitId: string,
    lines: CreateSalesRepoInput['items'],
  ): Promise<{ itemId: string; qty: string; listPrice: string | null; price: string | null; lineTotal: string | null }[]> {
    const result: { itemId: string; qty: string; listPrice: string | null; price: string | null; lineTotal: string | null }[] = [];
    for (const line of lines) {
      const override = line.unitPriceOverride ? String(line.unitPriceOverride) : null;
      let price = override;
      if (price === null) {
        const rows = await this.retailRepo.list({ unitId: sellerUnitId, itemId: line.itemId });
        price = rows[0]?.price ?? null;
      }
      const listPrice = price === '' ? null : price;
      result.push({
        itemId: line.itemId,
        qty: line.qty,
        listPrice,
        price: listPrice,
        lineTotal: listPrice === null ? null : round2(Number(line.qty) * Number(listPrice)).toFixed(2),
      });
    }
    return result;
  }

  private calcTotal(lines: { lineTotal: string | null }[], discountPercent: string, freight: string): string {
    const subtotal = lines.reduce((sum, l) => sum + Number(l.lineTotal ?? 0), 0);
    return round2(subtotal * (1 - Number(discountPercent) / 100) + Number(freight)).toFixed(2);
  }

  async list(query: SalesListQuery): Promise<SalesListResult> {
    const all = [...this.rows.values()]
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) =>
        query.unitId ? row.sellerUnitId === query.unitId || row.buyerUnitId === query.unitId : true,
      )
      .filter((row) => (query.buyerUnitId ? row.buyerUnitId === query.buyerUnitId : true))
      .filter((row) => (query.sellerUnitIds ? query.sellerUnitIds.includes(row.sellerUnitId) : true))
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
      );
    const size = Math.min(Math.max(query.size ?? 20, 1), 50);
    const page = Math.max(query.page ?? 1, 1);
    const start = (page - 1) * size;
    return {
      items: all.slice(start, start + size).map((row) => this.withPayment(row)),
      total: all.length,
      page,
      size,
    };
  }

  async findById(id: string): Promise<SalesOrderRecord | null> {
    const row = this.rows.get(id);
    return row ? this.withPayment(row) : null;
  }

  async listItems(salesOrderId: string): Promise<SalesOrderItemRecord[]> {
    const rows = this.items.get(salesOrderId) ?? [];
    const hydrated: SalesOrderItemRecord[] = [];
    for (const row of rows) {
      const item = await this.itemRepo.findById(row.itemId);
      hydrated.push({
        ...row,
        itemName: row.itemName ?? item?.name ?? null,
        spec: row.spec ?? item?.specUnit ?? null,
      });
    }
    return hydrated;
  }

  async listAllocations(salesOrderId: string): Promise<SalesBatchAllocationRecord[]> {
    const orderItemIds = new Set((this.items.get(salesOrderId) ?? []).map((i) => i.id));
    return this.allocRows
      .filter((a) => orderItemIds.has(a.orderItemId))
      .map((a) => {
        const batch = this.ledger.batches.get(a.batchId);
        return {
          ...a,
          batchNo: a.batchNo ?? batch?.batchNo ?? null,
          expiryDate: a.expiryDate ?? batch?.expiryDate ?? null,
        };
      });
  }

  async findPayment(salesOrderId: string): Promise<PaymentRecord | null> {
    const row = this.payments.get(salesOrderId);
    return row ? clonePayment(row) : null;
  }

  async create(input: CreateSalesRepoInput): Promise<SalesOrderRecord> {
    const now = new Date();
    const lines = await this.snapshotLines(input.sellerUnitId, input.items);
    const order: SalesOrderRecord = {
      id: uuid(),
      salesNo: this.nextSalesNo(),
      sellerUnitId: input.sellerUnitId,
      buyerUnitId: input.buyerUnitId,
      source: input.source,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress: normalizeEmpty(input.deliveryAddress),
      carrier: normalizeEmpty(input.carrier),
      trackingNo: normalizeEmpty(input.trackingNo),
      freight: input.freight,
      discountPercent: input.discountPercent,
      currency: input.currency,
      totalAmount: this.calcTotal(lines, input.discountPercent, input.freight),
      status: 'DRAFT',
      remark: normalizeEmpty(input.remark),
      sentAt: null,
      confirmedAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      hasPayment: false,
    };
    this.rows.set(order.id, cloneSalesOrder(order));
    this.items.set(
      order.id,
      lines.map((line) => ({
        id: uuid(),
        salesOrderId: order.id,
        itemId: line.itemId,
        itemName: null,
        spec: null,
        qty: line.qty,
        listPrice: line.listPrice,
        price: line.price,
        lineTotal: line.lineTotal,
      })),
    );
    return this.withPayment(order);
  }

  async update(id: string, input: PatchSalesInput): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT_MESSAGE);

    const now = new Date();
    let lines: { lineTotal: string | null; itemId: string; qty: string; listPrice: string | null; price: string | null }[] | null = null;
    if (input.items) {
      lines = await this.snapshotLines(existing.sellerUnitId, input.items);
      this.items.set(
        id,
        lines.map((line) => ({
          id: uuid(),
          salesOrderId: id,
          itemId: line.itemId,
          itemName: null,
          spec: null,
          qty: line.qty,
          listPrice: line.listPrice,
          price: line.price,
          lineTotal: line.lineTotal,
        })),
      );
    }
    const currentLines =
      lines ??
      (this.items.get(id) ?? []).map((l) => ({ lineTotal: l.lineTotal ?? '0' }));
    const freight = input.freight ?? existing.freight;
    const discountPercent = input.discountPercent ?? existing.discountPercent;
    const next: SalesOrderRecord = {
      ...existing,
      deliveryMethod: input.deliveryMethod ?? existing.deliveryMethod,
      deliveryAddress:
        input.deliveryAddress !== undefined ? normalizeEmpty(input.deliveryAddress) : existing.deliveryAddress,
      carrier: input.carrier !== undefined ? normalizeEmpty(input.carrier) : existing.carrier,
      trackingNo:
        input.trackingNo !== undefined ? normalizeEmpty(input.trackingNo) : existing.trackingNo,
      freight,
      discountPercent,
      currency: input.currency ?? existing.currency,
      remark: input.remark !== undefined ? normalizeEmpty(input.remark) : existing.remark,
      totalAmount: this.calcTotal(currentLines, discountPercent, freight),
      updatedAt: now,
    };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  async send(
    id: string,
    allocations: SalesAllocationInput[],
    sentBy: string,
    options: { carrier?: string | null; trackingNo?: string | null } = {},
  ): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT_MESSAGE);

    const rows = this.items.get(id) ?? [];
    const lines = await Promise.all(
      rows.map(async (line, index) => {
        const item = line.itemName ? null : await this.itemRepo.findById(line.itemId);
        return {
          index: index + 1,
          orderItemId: line.id,
          itemId: line.itemId,
          qty: Number(line.qty),
          listPrice: line.listPrice,
          price: line.price,
          itemName: line.itemName ?? item?.name ?? null,
        };
      }),
    );
    const lineByItem = new Map<string, { orderItemId: string; qty: number }>();
    for (const line of lines) {
      lineByItem.set(line.itemId, { orderItemId: line.orderItemId, qty: line.qty });
    }

    // 发送时逐行校验价格：无零售价且无行级改价 → 400（带行级明细）。
    const noPriceLines = lines.filter((l) => l.price === null || l.price === '');
    if (noPriceLines.length > 0) {
      throw errorWithLineDetails(
        SALES_LINE_INVALID_MESSAGE,
        noPriceLines.map((l) => ({
          index: l.index,
          itemId: l.itemId,
          itemName: l.itemName,
          reason: 'NO_LIST_PRICE' as const,
          message: `第${l.index}行（${l.itemName ?? '未知物品'}）：未设置零售价且未填写行级改价，无法发送`,
        })),
      );
    }

    const lineInfoOf = (itemId: string) => lines.find((l) => l.itemId === itemId) ?? null;
    const manualByItem = new Map<string, { batchId: string; qty: number }[]>();
    for (const allocLine of allocations) {
      if (!lineByItem.has(allocLine.itemId)) {
        throw errorWithLineDetails(SALES_LINE_INVALID_MESSAGE, [
          {
            index: 0,
            itemId: allocLine.itemId,
            itemName: null,
            reason: 'NO_BATCH_STOCK',
            message: `手工分配引用了订单中不存在的物品（${allocLine.itemId}）`,
          },
        ]);
      }
      const list = manualByItem.get(allocLine.itemId) ?? [];
      list.push({ batchId: allocLine.batchId, qty: Number(allocLine.qty) });
      manualByItem.set(allocLine.itemId, list);
    }
    for (const [itemId, list] of manualByItem) {
      const line = lineByItem.get(itemId)!;
      const total = list.reduce((sum, a) => sum + a.qty, 0);
      if (Math.abs(total - line.qty) > 0.001) {
        const info = lineInfoOf(itemId);
        throw errorWithLineDetails(SALES_LINE_INVALID_MESSAGE, [
          {
            index: info?.index ?? 0,
            itemId,
            itemName: info?.itemName ?? null,
            reason: 'QTY_EXCEEDS_STOCK',
            message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：手工分配数量与行数量不一致`,
          },
        ]);
      }
    }

    const now = new Date();
    for (const [itemId, line] of lineByItem) {
      const info = lineInfoOf(itemId);
      const manual = manualByItem.get(itemId);
      if (manual) {
        for (const allocLine of manual) {
          try {
            const allocationsOf = this.ledger.applyOutbound({
              unitId: existing.sellerUnitId,
              itemId,
              qty: allocLine.qty,
              batchId: allocLine.batchId,
              type: 'OUTBOUND_SALE',
              orderType: 'sales',
              orderId: existing.id,
              refNo: existing.salesNo,
              operatorId: sentBy,
            });
            for (const alloc of allocationsOf) {
              this.allocRows.push(this.allocRow(line.orderItemId, itemId, alloc, now));
            }
          } catch (cause) {
            if (cause instanceof Error) {
              if (cause.message.includes('STOCK_BATCH_NOT_FOUND')) {
                throw errorWithLineDetails(STOCK_BATCH_NOT_FOUND_MESSAGE, [
                  {
                    index: info?.index ?? 0,
                    itemId,
                    itemName: info?.itemName ?? null,
                    reason: 'NO_BATCH_STOCK',
                    message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：指定批次在当前仓库无库存`,
                  },
                ]);
              }
              if (cause.message.includes('INSUFFICIENT_STOCK')) {
                throw errorWithLineDetails(INSUFFICIENT_STOCK_MESSAGE, [
                  {
                    index: info?.index ?? 0,
                    itemId,
                    itemName: info?.itemName ?? null,
                    reason: 'QTY_EXCEEDS_STOCK',
                    message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：库存不足，无法发送`,
                  },
                ]);
              }
            }
            throw cause;
          }
        }
      } else {
        try {
          const allocationsOf = this.ledger.applyOutbound({
            unitId: existing.sellerUnitId,
            itemId,
            qty: line.qty,
            batchId: null,
            type: 'OUTBOUND_SALE',
            orderType: 'sales',
            orderId: existing.id,
            refNo: existing.salesNo,
            operatorId: sentBy,
          });
          for (const alloc of allocationsOf) {
            this.allocRows.push(this.allocRow(line.orderItemId, itemId, alloc, now));
          }
        } catch (cause) {
          if (cause instanceof Error && cause.message.includes('INSUFFICIENT_STOCK')) {
            throw errorWithLineDetails(INSUFFICIENT_STOCK_MESSAGE, [
              {
                index: info?.index ?? 0,
                itemId,
                itemName: info?.itemName ?? null,
                reason: 'QTY_EXCEEDS_STOCK',
                message: `第${info?.index ?? '?'}行（${info?.itemName ?? '未知物品'}）：库存不足，无法发送`,
              },
            ]);
          }
          throw cause;
        }
      }
    }

    const next: SalesOrderRecord = {
      ...existing,
      status: 'SENT',
      sentAt: now,
      updatedAt: now,
      carrier:
        options.carrier !== undefined && options.carrier !== null
          ? normalizeEmpty(options.carrier)
          : existing.carrier,
      trackingNo:
        options.trackingNo !== undefined && options.trackingNo !== null
          ? normalizeEmpty(options.trackingNo)
          : existing.trackingNo,
    };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  private allocRow(
    orderItemId: string,
    itemId: string,
    alloc: { batchId: string; qty: number; unitCost: number },
    now: Date,
  ): SalesBatchAllocationRecord {
    const batch = this.ledger.batches.get(alloc.batchId);
    return {
      id: uuid(),
      orderItemId,
      itemId,
      itemName: null,
      batchId: alloc.batchId,
      batchNo: batch?.batchNo ?? null,
      expiryDate: batch?.expiryDate ?? null,
      qty: alloc.qty.toFixed(2),
    };
  }

  async cancel(id: string, cancelledBy: string): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status === 'CONFIRMED' || existing.status === 'CANCELLED') {
      throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    }

    const now = new Date();
    if (existing.status !== 'DRAFT') {
      const orderItemIds = new Set((this.items.get(id) ?? []).map((i) => i.id));
      for (const a of this.allocRows.filter((row) => orderItemIds.has(row.orderItemId))) {
        const allocQty = Number(a.qty);
        const original = this.ledger.movements
          .filter(
            (m) =>
              m.orderType === 'sales' &&
              m.orderId === id &&
              m.batchId === a.batchId &&
              m.type === 'OUTBOUND_SALE',
          )
          .slice(-1)[0];
        const unitCost = original?.unitCost ?? 0;
        const key = this.ledger.stockKey(existing.sellerUnitId, a.itemId, a.batchId);
        const before = this.ledger.stock.get(key);
        const qtyBefore = before ? before.qty : 0;
        const qtyAfter = round2(qtyBefore + allocQty);
        this.ledger.stock.set(key, {
          unitId: existing.sellerUnitId,
          itemId: a.itemId,
          batchId: a.batchId,
          qty: qtyAfter,
          avgCost: before ? before.avgCost : unitCost,
          version: (before ? before.version : 0) + 1,
          updatedAt: now,
        });
        this.ledger.movements.push({
          unitId: existing.sellerUnitId,
          itemId: a.itemId,
          batchId: a.batchId,
          type: 'OUTBOUND_SALE_REVERSAL',
          qtyDelta: round2(allocQty),
          qtyBefore: round2(qtyBefore),
          qtyAfter,
          unitCost,
          orderType: 'sales',
          orderId: existing.id,
          refNo: existing.salesNo,
          operatorId: cancelledBy,
          createdAt: now,
        });
      }
      const payment = this.payments.get(id);
      if (payment) {
        this.payments.set(id, {
          ...payment,
          refundNote: payment.refundNote ?? '销售单已取消，退款线下处理',
        });
      }
    }
    const next: SalesOrderRecord = { ...existing, status: 'CANCELLED', updatedAt: now };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  async uploadPayment(
    id: string,
    input: { amount: string; currency: string; methodNote: string | null; proofFileId: string | null; uploadedBy: string },
  ): Promise<PaymentRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'SENT' && existing.status !== 'PAYMENT_UPLOADED') {
      throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    }
    const now = new Date();
    const previous = this.payments.get(id);
    const payment: PaymentRecord = {
      id: previous?.id ?? uuid(),
      salesOrderId: id,
      amount: input.amount,
      currency: input.currency,
      methodNote: normalizeEmpty(input.methodNote),
      proofFileId: normalizeEmpty(input.proofFileId),
      refundNote: previous?.refundNote ?? null,
      uploadedBy: input.uploadedBy,
      uploadedAt: now,
    };
    this.payments.set(id, clonePayment(payment));
    const next: SalesOrderRecord = { ...existing, status: 'PAYMENT_UPLOADED', updatedAt: now };
    this.rows.set(id, cloneSalesOrder(next));
    return clonePayment(payment);
  }

  async confirmReceipt(id: string, confirmedBy: string): Promise<SalesOrderRecord | null> {
    const existing = this.rows.get(id);
    if (!existing) return null;
    if (existing.status !== 'PAYMENT_UPLOADED') throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    const now = new Date();
    const next: SalesOrderRecord = {
      ...existing,
      status: 'CONFIRMED',
      confirmedAt: now,
      updatedAt: now,
    };
    this.rows.set(id, cloneSalesOrder(next));
    return this.withPayment(next);
  }

  referencesItem(itemId: string): boolean {
    for (const rows of this.items.values()) {
      if (rows.some((row) => row.itemId === itemId)) return true;
    }
    return false;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.rows.get(id);
    if (!existing) return false;
    if (existing.status !== 'DRAFT') throw new Error(SALES_STATE_CONFLICT_MESSAGE);
    const itemIds = new Set((this.items.get(id) ?? []).map((row) => row.id));
    this.allocRows = this.allocRows.filter((row) => !itemIds.has(row.orderItemId));
    this.items.delete(id);
    this.payments.delete(id);
    return this.rows.delete(id);
  }
}

// ── ck-??：仓库-零售签约（内存实现，与 SQL 实现语义一致）。 ────────────────────
class MemoryPartnershipRepository implements PartnershipRepository {
  private rows = new Map<string, PartnershipRecord>();

  constructor(
    private readonly unitRepo: MemoryUnitRepository,
    seed: PartnershipRecord[] = [],
  ) {
    for (const row of seed) this.rows.set(row.id, { ...row });
  }

  private async hydrate(row: PartnershipRecord): Promise<PartnershipRecord> {
    const [warehouse, retailer] = await Promise.all([
      this.unitRepo.findById(row.warehouseUnitId),
      this.unitRepo.findById(row.retailerUnitId),
    ]);
    return {
      ...row,
      warehouseUnitName: warehouse?.name ?? row.warehouseUnitName ?? null,
      retailerUnitName: retailer?.name ?? row.retailerUnitName ?? null,
    };
  }

  async list(query: PartnershipListQuery = {}): Promise<PartnershipRecord[]> {
    const hydrated: PartnershipRecord[] = [];
    const rows = [...this.rows.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    for (const row of rows) {
      if (query.warehouseUnitId && row.warehouseUnitId !== query.warehouseUnitId) continue;
      if (query.retailerUnitId && row.retailerUnitId !== query.retailerUnitId) continue;
      hydrated.push(await this.hydrate(row));
    }
    return hydrated;
  }

  async listWarehouseIds(retailerUnitId: string): Promise<string[]> {
    return [...this.rows.values()]
      .filter((row) => row.retailerUnitId === retailerUnitId)
      .map((row) => row.warehouseUnitId);
  }

  async findById(id: string): Promise<PartnershipRecord | null> {
    const row = this.rows.get(id);
    return row ? this.hydrate(row) : null;
  }

  async findByPair(
    warehouseUnitId: string,
    retailerUnitId: string,
  ): Promise<PartnershipRecord | null> {
    const row = [...this.rows.values()].find(
      (r) => r.warehouseUnitId === warehouseUnitId && r.retailerUnitId === retailerUnitId,
    );
    return row ? this.hydrate(row) : null;
  }

  async create(input: CreatePartnershipInput): Promise<PartnershipRecord> {
    const existing = await this.findByPair(input.warehouseUnitId, input.retailerUnitId);
    if (existing) return existing;
    const row: PartnershipRecord = {
      id: uuid(),
      warehouseUnitId: input.warehouseUnitId,
      warehouseUnitName: null,
      retailerUnitId: input.retailerUnitId,
      retailerUnitName: null,
      createdBy: input.createdBy,
      createdAt: new Date(),
    };
    this.rows.set(row.id, { ...row });
    return this.hydrate(row);
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 数量比较：null/undefined 按 0 处理，返回 -1/0/1。 */
function compareQty(a: string | null | undefined, b: string | null | undefined): number {
  const na = Number(a ?? 0);
  const nb = Number(b ?? 0);
  return na === nb ? 0 : na > nb ? 1 : -1;
}

export function createMemoryRepos(seed?: {
  users?: UserRecord[];
  units?: UnitRecord[];
  items?: ItemRecord[];
  files?: FileRecord[];
  shipments?: ShipmentRecord[];
  shipmentTrackings?: ShipmentTrackingRecord[];
  shipmentItems?: ShipmentItemRecord[];
  reviews?: DiscrepancyReviewRecord[];
  inbounds?: InboundOrderRecord[];
  inboundItems?: InboundOrderItemRecord[];
  returns?: ReturnOrderRecord[];
  returnItems?: ReturnOrderItemRecord[];
  outbounds?: OutboundOrderRecord[];
  outboundItems?: OutboundOrderItemRecord[];
  salesOrders?: SalesOrderRecord[];
  salesItems?: SalesOrderItemRecord[];
  salesAllocations?: SalesBatchAllocationRecord[];
  payments?: PaymentRecord[];
  partnerships?: PartnershipRecord[];
}): Repos {
  const stockLedger = new MemoryStockLedger();
  const shipmentRepo = new MemoryShipmentRepository({
    shipments: seed?.shipments,
    trackings: seed?.shipmentTrackings,
    items: seed?.shipmentItems,
    reviews: seed?.reviews,
  });
  const unitRepo = new MemoryUnitRepository(seed?.units);
  const itemRepo = new MemoryItemRepository(seed?.items);
  const inboundRepo = new MemoryInboundRepository(
    shipmentRepo,
    itemRepo,
    {
      inbounds: seed?.inbounds,
      inboundItems: seed?.inboundItems,
    },
    stockLedger,
  );
  const userRepo = new MemoryUserRepository(seed?.users);
  const retailPriceRepo = new MemoryRetailPriceRepository(stockLedger, unitRepo, itemRepo, userRepo);
  const salesRepo = new MemorySalesRepository(stockLedger, retailPriceRepo, unitRepo, itemRepo, {
    salesOrders: seed?.salesOrders,
    salesItems: seed?.salesItems,
    salesAllocations: seed?.salesAllocations,
    payments: seed?.payments,
  });
  const returnRepo = new MemoryReturnRepository(shipmentRepo, inboundRepo, salesRepo, stockLedger, {
    returns: seed?.returns,
    returnItems: seed?.returnItems,
  });
  const outboundRepo = new MemoryOutboundRepository(stockLedger, {
    outbounds: seed?.outbounds,
    outboundItems: seed?.outboundItems,
  });

  // 物品删除前的引用检查：任一单据/库存/零售价引用该物品即视为占用。
  itemRepo.addReferenceChecker((itemId) => shipmentRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => inboundRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => outboundRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => salesRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => returnRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) => retailPriceRepo.referencesItem(itemId));
  itemRepo.addReferenceChecker((itemId) =>
    [...stockLedger.batches.values()].some((row) => row.itemId === itemId),
  );
  itemRepo.addReferenceChecker((itemId) =>
    [...stockLedger.stock.values()].some((row) => row.itemId === itemId),
  );
  itemRepo.addReferenceChecker((itemId) =>
    stockLedger.movements.some((row) => row.itemId === itemId),
  );

  return {
    users: userRepo,
    units: unitRepo,
    items: itemRepo,
    files: new MemoryFileRepository(seed?.files),
    shipments: shipmentRepo,
    inbounds: inboundRepo,
    returns: returnRepo,
    outbounds: outboundRepo,
    stock: new MemoryStockRepository(stockLedger, unitRepo, itemRepo),
    retailPrices: retailPriceRepo,
    sales: salesRepo,
    partnerships: new MemoryPartnershipRepository(unitRepo, seed?.partnerships),
    notifications: new MemoryNotificationRepository(),
    emailLogs: new MemoryEmailLogRepository(),
    auditLogs: new MemoryAuditLogRepository(),
  };
}
