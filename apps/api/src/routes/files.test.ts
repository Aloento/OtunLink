import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { authenticate } from '../auth/middleware';
import { createMemoryRepos } from '../repos/memory';
import { filesRouter } from './files';
import type { AppEnv, FileRecord, TokenClaims, UserRecord } from '../types';

const now = new Date('2025-01-01T00:00:00.000Z');

function user(partial: Partial<UserRecord> & { entraSub: string }): UserRecord {
  return {
    id: partial.id ?? `id-${partial.entraSub}`,
    entraSub: partial.entraSub,
    email: `${partial.entraSub}@test.local`,
    name: partial.entraSub,
    role: partial.role ?? 'COLLECTOR',
    scopeUnitId: null,
    status: partial.status ?? 'ACTIVE',
    locale: 'zh-CN',
    createdAt: now,
    updatedAt: now,
  };
}

function file(partial: Partial<FileRecord> & { id: string }): FileRecord {
  return {
    key: `items/${partial.id}.jpg`,
    thumbnailKey: null,
    mime: 'image/jpeg',
    size: 12,
    width: 8,
    height: 6,
    createdAt: now,
    ...partial,
  };
}

// 最小可解析 JPEG（SOF0，8x6）：魔数 FF D8 FF + SOF0 段。
const JPEG_8x6 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x06, 0x00, 0x08, 0x00,
]);

// 最小可解析 PNG（IHDR，1x1）：仅需头部 24 字节满足 sniffPng。
const PNG_1x1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
]);

function makeApp(seed: { files?: FileRecord[] } = {}) {
  const repos = createMemoryRepos({
    users: [user({ entraSub: 'collector' })],
    files: seed.files,
  });
  const uploaded: Array<{ key: string; mime: string; size: number }> = [];
  const app = new Hono<AppEnv>();
  app.use(
    '/api/v1/files/*',
    authenticate({
      verifyToken: async (_env, token): Promise<TokenClaims> => ({ sub: token }),
      getRepos: async () => repos,
    }),
  );
  app.route(
    '/api/v1/files',
    filesRouter({
      putObject: async (_env, key, body, mime) => {
        uploaded.push({ key, mime, size: body.length });
      },
      presignedGetUrl: async (_env, key) => `https://presigned.example/${key}?sig=1`,
      randomUUID: () => '00000000-0000-4000-8000-0000000000aa',
    }),
  );
  return { app, repos, uploaded };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function multipart(fields: Record<string, File>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

describe('files 图片上传 API', () => {
  it('未登录返回 401', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/files', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('缺少 image 字段返回 400', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/files', {
      method: 'POST',
      headers: auth('collector'),
      body: multipart({}),
    });
    expect(res.status).toBe(400);
  });

  it('非图片内容返回 400 FILE_INVALID', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/files', {
      method: 'POST',
      headers: auth('collector'),
      body: multipart({ image: new File(['hello world'], 'x.txt', { type: 'text/plain' }) }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'FILE_INVALID' } });
  });

  it('超过 5MB 返回 413 FILE_TOO_LARGE', async () => {
    const { app } = makeApp();
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const res = await app.request('/api/v1/files', {
      method: 'POST',
      headers: auth('collector'),
      body: multipart({ image: new File([big], 'big.jpg', { type: 'image/jpeg' }) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
  });

  it('合法 JPEG 上传成功并创建文件记录', async () => {
    const { app, uploaded } = makeApp();
    const res = await app.request('/api/v1/files', {
      method: 'POST',
      headers: auth('collector'),
      body: multipart({ image: new File([JPEG_8x6], 'a.jpg', { type: 'image/jpeg' }) }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; mime: string; width: number; height: number; hasThumbnail: boolean };
    };
    expect(body.data.mime).toBe('image/jpeg');
    expect(body.data.width).toBe(8);
    expect(body.data.height).toBe(6);
    expect(body.data.hasThumbnail).toBe(false);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].key).toBe('items/00000000-0000-4000-8000-0000000000aa.jpg');
  });

  it('带缩略图时上传两个对象并标记 hasThumbnail', async () => {
    const { app, uploaded } = makeApp();
    const res = await app.request('/api/v1/files', {
      method: 'POST',
      headers: auth('collector'),
      body: multipart({
        image: new File([JPEG_8x6], 'a.jpg', { type: 'image/jpeg' }),
        thumb: new File([PNG_1x1], 't.png', { type: 'image/png' }),
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { hasThumbnail: boolean } };
    expect(body.data.hasThumbnail).toBe(true);
    expect(uploaded).toHaveLength(2);
    expect(uploaded[1].key).toContain('_thumb.');
  });

  it('预签名 URL 返回主图与缩略图地址', async () => {
    const { app } = makeApp({
      files: [
        file({
          id: 'f1',
          thumbnailKey: 'items/f1_thumb.png',
        }),
      ],
    });
    const res = await app.request('/api/v1/files/f1/url', { headers: auth('collector') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { url: string; thumbnailUrl: string } };
    expect(body.data.url).toContain('items/f1.jpg');
    expect(body.data.thumbnailUrl).toContain('items/f1_thumb.png');
  });

  it('文件不存在返回 404', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/files/missing/url', { headers: auth('collector') });
    expect(res.status).toBe(404);
  });
});
