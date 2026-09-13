// 物品内存仓库（items + item_images）。
import type { CreateItemInput, ItemImageRecord, ItemListQuery, ItemListResult, ItemRecord, ItemRepository, UpdateItemInput } from '../../types';
import { cloneFile } from './files';
import { normalizeEmpty, randomSkuCode, uuid } from './helpers';

// 条码冲突信号：内存实现用消息前缀标记，路由层据此映射为 BARCODE_CONFLICT（409）。
const BARCODE_CONFLICT_MESSAGE = 'BARCODE_CONFLICT: barcode already taken by an ACTIVE item';

export class MemoryItemRepository implements ItemRepository {
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
      minSaleUnit: input.minSaleUnit ?? 'SPEC',
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
      ...(patch.minSaleUnit !== undefined ? { minSaleUnit: patch.minSaleUnit } : {}),
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

  async replaceImages(itemId: string, fileIds: string[]): Promise<ItemImageRecord[]> {
    const next: ItemImageRecord[] = fileIds.map((fileId, index) => ({
      id: uuid(),
      itemId,
      fileId,
      isPrimary: index === 0,
      sortOrder: index + 1,
      createdAt: new Date(),
    }));
    this.images.set(itemId, next);
    return next.map(cloneItemImage);
  }

  async hasReferences(id: string): Promise<boolean> {
    return this.referenceCheckers.some((check) => check(id));
  }

  async delete(id: string): Promise<boolean> {
    if (!this.rows.has(id)) return false;
    this.images.delete(id);
    return this.rows.delete(id);
  }

  async merge(sourceId: string, targetId: string): Promise<ItemRecord | null> {
    if (sourceId === targetId) return null;
    const source = this.rows.get(sourceId);
    const target = this.rows.get(targetId);
    if (!source || !target) return null;
    const targetImages = this.images.get(targetId) ?? [];
    const sourceImages = this.images.get(sourceId) ?? [];
    this.images.set(
      targetId,
      [...targetImages, ...sourceImages.map((image) => ({ ...image, itemId: targetId }))].map(
        cloneItemImage,
      ),
    );
    this.images.delete(sourceId);
    this.rows.delete(sourceId);
    return cloneItem(target);
  }
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
