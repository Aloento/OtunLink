import type { SqlExecutor } from '@otunlink/db';

import type {
  CreateFileInput,
  CreateItemInput,
  CreateUnitInput,
  CreateUserInput,
  FileRecord,
  ItemImageRecord,
  ItemListQuery,
  ItemListResult,
  ItemRecord,
  Repos,
  UnitRecord,
  UpdateItemInput,
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

  return { users, units, items, files };
}

// 将 undefined/空字符串归一化为 null（写入 DB 的 NULL）。
function nn(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
