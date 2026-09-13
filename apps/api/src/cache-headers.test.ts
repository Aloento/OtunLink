import { describe, expect, it } from 'vitest';

import { createApp } from './index';
import { createMemoryRepos } from './repos/memory';
import type { TokenClaims, UserRecord } from './types';

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

function makeApp(seed: Parameters<typeof createMemoryRepos>[0] = {}) {
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

// API 响应必须禁用缓存：缓存会让用户写入后看不到最新数据（新鲜度只由客户端查询失效控制）。
describe('API 响应缓存头', () => {
  it('健康检查返回 Cache-Control: no-store', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('未鉴权的 401 错误响应也禁用缓存', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/items');

    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('业务数据响应禁用缓存', async () => {
    const { app } = makeApp({ users: [user({ entraSub: 'admin', role: 'ADMIN' })] });
    const res = await app.request('/api/v1/admin/units', {
      headers: auth('admin'),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('404 未匹配路由同样禁用缓存', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/v1/not-a-route');

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
