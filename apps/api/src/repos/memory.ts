import type {
  ConfirmReceiptRepoInput,
  CreateFileInput,
  CreateItemInput,
  CreateReturnRepoInput,
  CreateReviewInput,
  CreateShipmentInput,
  CreateUnitInput,
  CreateUserInput,
  DiscrepancyReviewItemRecord,
  DiscrepancyReviewRecord,
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
  Repos,
  ReturnListQuery,
  ReturnListResult,
  ReturnOrderItemRecord,
  ReturnOrderRecord,
  ReturnRepository,
  SaveCountResult,
  ShipmentCountRepoInput,
  ShipmentItemRecord,
  ShipmentListQuery,
  ShipmentListResult,
  ShipmentRecord,
  ShipmentRepository,
  ShipmentTrackingRecord,
  UnitRecord,
  UnitRepository,
  UpdateItemInput,
  UpdateShipmentInput,
  UpdateUnitInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../types';
import { mergeInboundLines, qtyEqual, type MergedInboundLine } from './inbound-lines';

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

  async list(opts: { includeInactive?: boolean; scopeUnitId?: string } = {}): Promise<UnitRecord[]> {
    return [...this.rows.values()]
      .filter((row) => (opts.includeInactive ? true : row.isActive))
      .filter((row) => (opts.scopeUnitId ? row.id === opts.scopeUnitId : true))
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

  constructor(seed: ItemRecord[] = []) {
    for (const row of seed) this.rows.set(row.id, cloneItem(row));
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
    const all = [...this.rows.values()]
      .filter((row) => {
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

  async create(input: CreateItemInput): Promise<ItemRecord> {
    this.assertBarcodeAvailable(input.barcode ?? null);
    const now = new Date();
    const row: ItemRecord = {
      id: uuid(),
      sku: normalizeEmpty(input.sku),
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
// ck-06：点货/差异协商业务信号（路由层映射为对应错误码）。
const COUNTING_STATE_MESSAGE =
  'COUNTING_STATE_CONFLICT: shipment is not in a countable state or version mismatch';
const COUNT_LINE_INVALID_MESSAGE = 'COUNT_LINE_INVALID: count line does not belong to the shipment';
const REVIEW_ALREADY_PROCESSED_MESSAGE =
  'REVIEW_ALREADY_PROCESSED: review already processed or pending review exists';
const REVIEW_NO_DIFFERENCE_MESSAGE = 'REVIEW_NO_DIFFERENCE: no discrepancy to review';
// ck-07：确认入库 / 发货退货业务信号（路由层映射为对应错误码）。
const SHIPMENT_NOT_READY_MESSAGE = 'SHIPMENT_NOT_READY: shipment is not READY or lines mismatch';
const INBOUND_STATE_CONFLICT_MESSAGE = 'INBOUND_STATE_CONFLICT: only DRAFT inbound orders can be posted';
const RETURN_STATE_CONFLICT_MESSAGE = 'RETURN_STATE_CONFLICT: shipment is not READY for return';
const RETURN_ALREADY_PROCESSED_MESSAGE = 'RETURN_ALREADY_PROCESSED: return order already processed';
const RETURN_LINE_INVALID_MESSAGE = 'RETURN_LINE_INVALID: return line is invalid';

/** 单据编号 §8.4：SH-YYYYMMDD-XXXX（UTC 日期 + 4 位当日序号）。 */
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

  /** 内部状态流转：入库/退货仓储复用，直接覆盖发货单状态（ck-07）。 */
  transitionTo(id: string, status: ShipmentRecord['status']): void {
    const shipment = this.rows.get(id);
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND: shipment does not exist');
    this.rows.set(id, cloneShipment({ ...shipment, status, updatedAt: new Date() }));
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

// ── ck-07 内存实现：确认入库 + 发货退货。 ────────────────────────────────────

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

class MemoryInboundRepository implements InboundRepository {
  private rows = new Map<string, InboundOrderRecord>();
  private items = new Map<string, InboundOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  /** 测试可检查的批次 / 库存 / 台账快照。 */
  readonly batches = new Map<string, MemoryBatchRecord>();
  readonly stock = new Map<string, MemoryStockRecord>();
  readonly movements: MemoryStockMovementRecord[] = [];

  constructor(
    private readonly shipmentRepo: MemoryShipmentRepository,
    seed: { inbounds?: InboundOrderRecord[]; inboundItems?: InboundOrderItemRecord[] } = {},
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

  private stockKey(unitId: string, itemId: string, batchId: string): string {
    return `${unitId}|${itemId}|${batchId}`;
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
    const itemRows: InboundOrderItemRecord[] = merged.map((line) => ({
      id: uuid(),
      inboundOrderId: inbound.id,
      itemId: line.itemId,
      batchId: null,
      qty: line.qty,
      unitCost: line.unitCost,
      lineNote: null,
      productionDate: normalizeEmpty(line.productionDate),
      expiryDate: normalizeEmpty(line.expiryDate),
      batchNo: normalizeEmpty(line.batchNo),
      createdAt: now,
    }));
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
    const itemRows = (this.items.get(id) ?? []).map((row) => {
      const batch: MemoryBatchRecord = {
        id: uuid(),
        itemId: row.itemId,
        batchNo: row.batchNo,
        productionDate: row.productionDate,
        expiryDate: row.expiryDate,
        sourceType: existing.sourceType,
        sourceOrderId: existing.shipmentId,
        createdBy: postedBy,
      };
      this.batches.set(batch.id, batch);

      const inQty = Number(row.qty);
      const inCost = Number(row.unitCost);
      const key = this.stockKey(existing.warehouseUnitId, row.itemId, batch.id);
      const before = this.stock.get(key);
      const qtyBefore = before ? before.qty : 0;
      const qtyAfter = qtyBefore + inQty;
      const avgCost =
        qtyAfter > 0 ? (qtyBefore * (before ? before.avgCost : 0) + inQty * inCost) / qtyAfter : 0;
      this.stock.set(key, {
        unitId: existing.warehouseUnitId,
        itemId: row.itemId,
        batchId: batch.id,
        qty: round2(qtyAfter),
        avgCost: round2(avgCost),
        version: (before ? before.version : 0) + 1,
      });
      this.movements.push({
        unitId: existing.warehouseUnitId,
        itemId: row.itemId,
        batchId: batch.id,
        type: 'INBOUND_SHIPMENT',
        qtyDelta: round2(inQty),
        qtyBefore: round2(qtyBefore),
        qtyAfter: round2(qtyAfter),
        unitCost: inCost,
        orderType: 'inbound',
        orderId: existing.id,
        refNo: existing.inboundNo,
        operatorId: postedBy,
      });
      return { ...row, batchId: batch.id };
    });
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
}

class MemoryReturnRepository implements ReturnRepository {
  private rows = new Map<string, ReturnOrderRecord>();
  private items = new Map<string, ReturnOrderItemRecord[]>();
  private dailyCounters = new Map<string, number>();

  constructor(
    private readonly shipmentRepo: MemoryShipmentRepository,
    private readonly inboundRepo: MemoryInboundRepository,
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
    return (this.items.get(returnOrderId) ?? []).map(cloneReturnItem);
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
      qty: line.qty,
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
}): Repos {
  const shipmentRepo = new MemoryShipmentRepository({
    shipments: seed?.shipments,
    trackings: seed?.shipmentTrackings,
    items: seed?.shipmentItems,
    reviews: seed?.reviews,
  });
  const inboundRepo = new MemoryInboundRepository(shipmentRepo, {
    inbounds: seed?.inbounds,
    inboundItems: seed?.inboundItems,
  });
  const returnRepo = new MemoryReturnRepository(shipmentRepo, inboundRepo, {
    returns: seed?.returns,
    returnItems: seed?.returnItems,
  });
  return {
    users: new MemoryUserRepository(seed?.users),
    units: new MemoryUnitRepository(seed?.units),
    items: new MemoryItemRepository(seed?.items),
    files: new MemoryFileRepository(seed?.files),
    shipments: shipmentRepo,
    inbounds: inboundRepo,
    returns: returnRepo,
  };
}
