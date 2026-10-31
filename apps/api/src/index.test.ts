import { describe, expect, it } from 'vitest';

import app, { createApp } from './index';
import type { AppDeps } from './index';

// createApp 的依赖可替换：这些用例不打真实网络与数据库。
const stubDeps: AppDeps = {
  verifyToken: async () => ({ sub: 'sub-1', email: 'a@b.c' }) as never,
  getRepos: async () => null,
};

describe('GET /api/v1/health', () => {
  it('returns { ok: true }', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await app.request('/api/v1/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

// 未捕获异常必须仍是 JSON 信封：Hono 默认吐纯文本 500，前端只能归入
// 「服务器或网络异常」，拿不到状态码与错误码——这正是登录后一句死胡同提示的成因。
describe('app.onError', () => {
  it('把未捕获异常转成 500 + INTERNAL_ERROR JSON', async () => {
    const subject = createApp(stubDeps);
    subject.get('/__boom', () => {
      throw new Error('boom');
    });

    const res = await subject.request('/__boom');
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('boom');
  });
});

describe('CORS 来源白名单', () => {
  it('放行生产域名并回显 Origin', async () => {
    const res = await app.request('/api/v1/health', {
      headers: { Origin: 'https://otun.musi.land' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://otun.musi.land');
  });

  it('未知来源不回显 Access-Control-Allow-Origin', async () => {
    const res = await app.request('/api/v1/health', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('CORS_ORIGINS 可追加 Pages 预览域', async () => {
    const res = await app.request(
      '/api/v1/health',
      { headers: { Origin: 'https://pr-12.otunlink.pages.dev' } },
      { CORS_ORIGINS: 'https://pr-12.otunlink.pages.dev' } as never,
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://pr-12.otunlink.pages.dev',
    );
  });

  it('预检请求返回 204 且允许 Authorization 头', async () => {
    const res = await app.request('/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://otun.musi.land',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'authorization',
    );
  });
});
