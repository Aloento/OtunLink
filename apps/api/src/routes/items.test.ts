import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import { createMemoryRepos } from '../repos/memory';
import type { FileRecord, ItemRecord, TokenClaims, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

function user(partial: Partial<UserRecord> & { entraSub: string }): UserRecord {
  return {
    id: partial.id ?? `id-${partial.entraSub}`,
    entraSub: partial.entraSub,
    email: partial.email ?? `${partial.entraSub}@test.local`,
    name: partial.name ?? partial.entraSub,
    role: partial.role ?? null,
    scopeUnitId: partial.scopeUnitId ?? null,
    status: partial.status ?? 'ACTIVE',
    locale: partial.locale ?? 'zh-CN',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function item(partial: Partial<ItemRecord> & { id: string }): ItemRecord {
  return {
    sku: null,
    name: '测试物品',
    barcode: null,
    specUnit: 'PIECE',
    innerUnit: null,
    innerCount: null,
    isPerishable: false,
    category: null,
    description: null,
    status: 'ACTIVE',
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function file(partial: Partial<FileRecord> & { id: string }): FileRecord {
  return {
    key: `items/${partial.id}.jpg`,
    thumbnailKey: null,
    mime: 'image/jpeg',
    size: 1024,
    width: 800,
    height: 600,
    createdAt: now,
    ...partial,
  };
}

function makeApp(seed: { users?: UserRecord[]; items?: ItemRecord[]; files?: FileRecord[] }) {
  const repos = createMemoryRepos(seed);
  const app = createApp({
    verifyToken: async (_env, token): Promise<TokenClaims> => ({ sub: token }),
    getRepos: async () => repos,
  });
  return { app, repos };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function json(token: string) {
  return { ...auth(token), 'Content-Type': 'application/json' };
}

const collector = user({ entraSub: 'collector', role: 'COLLECTOR' });

describe('items 物品目录 API', () => {
  it('未登录访问 /items 返回 401', async () => {
    const { app } = makeApp({});
    const res = await app.request('/api/v1/items');
    expect(res.status).toBe(401);
  });

  it('空目录列表返回空数组与总数', async () => {
    const { app } = makeApp({ users: [collector] });
    const res = await app.request('/api/v1/items', { headers: auth('collector') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: unknown[]; total: number } };
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it('创建物品并使用默认值', async () => {
    const { app } = makeApp({ users: [collector] });
    const res = await app.request('/api/v1/items', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ name: '苹果' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { name: string; specUnit: string; status: string; barcode: null };
    };
    expect(body.data.name).toBe('苹果');
    expect(body.data.specUnit).toBe('PIECE');
    expect(body.data.status).toBe('ACTIVE');
    expect(body.data.barcode).toBeNull();
  });

  it('按条码定位（by-barcode）', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [item({ id: 'i1', name: '苹果', barcode: '6901234567890' })],
    });
    const res = await app.request('/api/v1/items/by-barcode?code=6901234567890', {
      headers: auth('collector'),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; name: string } };
    expect(body.data.id).toBe('i1');
  });

  it('条码不存在返回 404', async () => {
    const { app } = makeApp({ users: [collector] });
    const res = await app.request('/api/v1/items/by-barcode?code=nope', {
      headers: auth('collector'),
    });
    expect(res.status).toBe(404);
  });

  it('ACTIVE 条码唯一：重复创建返回 409', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [item({ id: 'i1', barcode: '6901234567890' })],
    });
    const res = await app.request('/api/v1/items', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ name: '另一个', barcode: '6901234567890' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'BARCODE_CONFLICT' } });
  });

  it('原物品设为 INACTIVE 后条码可复用', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [item({ id: 'i1', barcode: '6901234567890' })],
    });
    const off = await app.request('/api/v1/items/i1', {
      method: 'PATCH',
      headers: json('collector'),
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    expect(off.status).toBe(200);

    const res = await app.request('/api/v1/items', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ name: '复用条码', barcode: '6901234567890' }),
    });
    expect(res.status).toBe(201);
  });

  it('创建时关联图片 fileIds 并在响应中返回 images', async () => {
    const { app } = makeApp({
      users: [collector],
      files: [file({ id: '00000000-0000-4000-8000-0000000000f1' })],
    });
    const res = await app.request('/api/v1/items', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ name: '带图物品', fileIds: ['00000000-0000-4000-8000-0000000000f1'] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { images: Array<{ fileId: string }> } };
    expect(body.data.images).toHaveLength(1);
    expect(body.data.images[0].fileId).toBe('00000000-0000-4000-8000-0000000000f1');
  });

  it('列表搜索 q 匹配名称', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [
        item({ id: 'i1', name: '苹果' }),
        item({ id: 'i2', name: '香蕉' }),
      ],
    });
    const res = await app.request('/api/v1/items?q=苹果', { headers: auth('collector') });
    const body = (await res.json()) as { data: { items: Array<{ id: string }>; total: number } };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].id).toBe('i1');
  });

  it('PENDING 用户访问返回 403', async () => {
    const { app } = makeApp({ users: [user({ entraSub: 'pending', status: 'PENDING' })] });
    const res = await app.request('/api/v1/items', { headers: auth('pending') });
    expect(res.status).toBe(403);
  });

  it('PATCH 物品 sku 设为 null 可正常清空', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [item({ id: 'i1', sku: 'OLD-SKU' })],
    });
    const res = await app.request('/api/v1/items/i1', {
      method: 'PATCH',
      headers: json('collector'),
      body: JSON.stringify({ sku: null }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sku: string | null } };
    expect(body.data.sku).toBeNull();
  });

  it('PATCH 物品 sku 设为空字符串时归一化为 null', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [item({ id: 'i1', sku: 'OLD-SKU' })],
    });
    const res = await app.request('/api/v1/items/i1', {
      method: 'PATCH',
      headers: json('collector'),
      body: JSON.stringify({ sku: '   ' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sku: string | null } };
    expect(body.data.sku).toBeNull();
  });

  it('分类列表去重、去空并按使用次数降序、名称升序排列', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [
        item({ id: 'i1', category: '食品' }),
        item({ id: 'i2', category: '饮料' }),
        item({ id: 'i3', category: '食品' }),
        item({ id: 'i4', category: '   ' }),
        item({ id: 'i5', category: null }),
        item({ id: 'i6', category: '苹果' }),
      ],
    });
    const res = await app.request('/api/v1/items/categories', { headers: auth('collector') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { categories: string[] } };
    expect(body.data.categories).toEqual(['食品', '苹果', '饮料']);
  });

  it('列表按 category 精确过滤', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [
        item({ id: 'i1', name: '苹果', category: '食品' }),
        item({ id: 'i2', name: '可乐', category: '饮料' }),
        item({ id: 'i3', name: '香蕉', category: '食品' }),
      ],
    });
    const res = await app.request('/api/v1/items?category=食品', { headers: auth('collector') });
    const body = (await res.json()) as { data: { items: Array<{ id: string }>; total: number } };
    expect(body.data.total).toBe(2);
    expect(body.data.items.map((i) => i.id).sort()).toEqual(['i1', 'i3']);
  });

  it('category 为空白时不过滤', async () => {
    const { app } = makeApp({
      users: [collector],
      items: [
        item({ id: 'i1', name: '苹果', category: '食品' }),
        item({ id: 'i2', name: '可乐', category: '饮料' }),
      ],
    });
    const res = await app.request('/api/v1/items?category=%20%20', { headers: auth('collector') });
    const body = (await res.json()) as { data: { total: number } };
    expect(body.data.total).toBe(2);
  });

  it('自动生成 SKU 不含 SKU-/ITEM 前缀且不超过 16 字符（含 ASCII 名）', async () => {
    const { app } = makeApp({ users: [collector] });
    const res = await app.request('/api/v1/items', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ name: 'Milk 牛奶' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { sku: string } };
    expect(body.data.sku).toMatch(/^MILK-[A-Z0-9]{6}$/);
    expect(body.data.sku.length).toBeLessThanOrEqual(16);
  });

  it('纯中文名自动生成纯随机短码（无 ITEM 兜底）', async () => {
    const { app } = makeApp({ users: [collector] });
    const res = await app.request('/api/v1/items', {
      method: 'POST',
      headers: json('collector'),
      body: JSON.stringify({ name: '苹果' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { sku: string } };
    expect(body.data.sku).toMatch(/^[A-Z0-9]{8}$/);
    expect(body.data.sku).not.toContain('ITEM');
    expect(body.data.sku.length).toBeLessThanOrEqual(16);
  });
});
