import {
  ErrorCodes,
  itemAttachImagesSchema,
  itemCreateSchema,
  itemPatchSchema,
  Permissions,
} from '@otunlink/shared';
import { Hono } from 'hono';
import { requirePermission } from '../auth/middleware';
import { itemDto, itemImageDto } from '../lib/dto';
import {
  dbUnavailable,
  error,
  notFound,
  ok,
  parsePositiveInt,
  readJson,
  validationError,
} from '../lib/http';
import type { AppEnv, CreateItemInput, UpdateItemInput } from '../types';

function isBarcodeConflict(cause: unknown): boolean {
  if (cause instanceof Error) {
    const message = cause.message ?? '';
    if (message.includes('BARCODE_CONFLICT')) return true;
    if (message.includes('items_barcode_active_unique')) return true;
    if (message.includes('duplicate key value')) return true;
  }
  if (typeof cause === 'object' && cause !== null) {
    const code = (cause as { code?: string }).code;
    if (code === '23505') return true;
  }
  return false;
}

// 物品目录。条码「ACTIVE 部分唯一」由数据库唯一索引与
// 内存实现的显式检查共同保障；冲突统一映射为 409 BARCODE_CONFLICT。
export function itemsRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  const read = requirePermission(Permissions.ITEMS_READ);
  const write = requirePermission(Permissions.ITEMS_WRITE);

  router.get('/', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const q = c.req.query('q')?.trim() || undefined;
    const category = c.req.query('category')?.trim() || undefined;
    const page = parsePositiveInt(c.req.query('page'), 1);
    const size = parsePositiveInt(c.req.query('size'), 50, 50);

    const result = await repos.items.list({ q, category, page, size });
    return ok(c, { ...result, items: result.items.map(itemDto) });
  });

  // 分类列表：从物品自由文本 category 派生（去重、非空，按使用次数降序再按名称升序）。
  router.get('/categories', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const categories = await repos.items.listCategories();
    return ok(c, { categories });
  });

  // 扫码定位：按条码查找 ACTIVE 物品（放在 /:id 之前注册）。
  router.get('/by-barcode', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const code = c.req.query('code')?.trim();
    if (!code) return validationError(c, '缺少条码参数 code');

    const item = await repos.items.findByBarcode(code);
    if (!item) return notFound(c, '未找到该条码对应的物品');
    return ok(c, itemDto(item));
  });

  router.get('/:id', read, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const item = await repos.items.findById(c.req.param('id'));
    if (!item) return notFound(c, '物品不存在');

    const images = await repos.items.listImages(item.id);
    return ok(c, { ...itemDto(item), images: images.map(itemImageDto) });
  });

  router.post('/', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = itemCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const { fileIds, ...rest } = parsed.data;
    const input: CreateItemInput = {
      ...rest,
      createdBy: c.get('auth').user!.id,
    };

    try {
      const created = await repos.items.create(input);
      if (fileIds && fileIds.length > 0) {
        await repos.items.attachImages(created.id, fileIds);
      }
      const images = await repos.items.listImages(created.id);
      return ok(c, { ...itemDto(created), images: images.map(itemImageDto) }, 201);
    } catch (cause) {
      if (isBarcodeConflict(cause)) {
        return error(c, 409, ErrorCodes.BARCODE_CONFLICT, '条码已被其他启用中的物品占用');
      }
      throw cause;
    }
  });

  router.patch('/:id', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = itemPatchSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    try {
      const updated = await repos.items.update(c.req.param('id'), parsed.data as UpdateItemInput);
      if (!updated) return notFound(c, '物品不存在');
      return ok(c, itemDto(updated));
    } catch (cause) {
      if (isBarcodeConflict(cause)) {
        return error(c, 409, ErrorCodes.BARCODE_CONFLICT, '条码已被其他启用中的物品占用');
      }
      throw cause;
    }
  });

  router.delete('/:id', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const id = c.req.param('id');
    const item = await repos.items.findById(id);
    if (!item) return notFound(c, '物品不存在');

    const hasReferences = await repos.items.hasReferences(id);
    if (hasReferences) {
      return error(c, 409, ErrorCodes.ITEM_IN_USE, '该物品已被单据/库存引用，无法删除');
    }

    const deleted = await repos.items.delete(id);
    if (!deleted) return notFound(c, '物品不存在');
    return ok(c, { id });
  });

  router.post('/:id/images', write, async (c) => {
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    const item = await repos.items.findById(c.req.param('id'));
    if (!item) return notFound(c, '物品不存在');

    const body = await readJson(c);
    if (body === undefined) return validationError(c, '请求体不是合法 JSON');

    const parsed = itemAttachImagesSchema.safeParse(body);
    if (!parsed.success) return validationError(c, '参数不合法', parsed.error.flatten());

    const images = await repos.items.attachImages(item.id, parsed.data.fileIds);
    return ok(c, images.map(itemImageDto));
  });

  return router;
}
