import type { SqlExecutor } from '@otunlink/db';

import type {
  CreateFileInput,
  CreateItemInput,
  CreateReviewInput,
  CreateShipmentInput,
  CreateUnitInput,
  CreateUserInput,
  DiscrepancyReviewItemRecord,
  DiscrepancyReviewRecord,
  FileRecord,
  ItemImageRecord,
  ItemListQuery,
  ItemListResult,
  ItemRecord,
  Repos,
  SaveCountResult,
  ShipmentCountRepoInput,
  ShipmentItemRecord,
  ShipmentListQuery,
  ShipmentListResult,
  ShipmentRecord,
  ShipmentTrackingRecord,
  UnitRecord,
  UpdateItemInput,
  UpdateShipmentInput,
  UpdateUnitInput,
  UpdateUserInput,
  UserRecord,
} from '../types';

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

  return { users, units, items, files, shipments };
}

// 将 undefined/空字符串归一化为 null（写入 DB 的 NULL）。
function nn(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
