import { describe, expect, it } from 'vitest';

import { createApp } from '../index';
import type { Repos, TokenClaims } from '../types';
import { resolveAudience } from './verifier';

// 这些用例覆盖「故障必须可诊断」这一条：
// 之前 DB 查询异常会冒到 Hono 默认处理器 → 纯文本 500，前端既拿不到状态码也拿不到
// error.code，只能把一切归入「服务器或网络异常」，用户无从判断该重试还是该重新登录。

function reposThatThrow(message: string, code?: string): Repos {
  const boom = () => {
    throw Object.assign(new Error(message), code ? { code } : {});
  };
  return { users: { findByEntraSub: boom } } as unknown as Repos;
}

function appWith(repos: Repos | null) {
  return createApp({
    verifyToken: async (_env, token): Promise<TokenClaims> => ({ sub: token }),
    getRepos: async () => repos,
  });
}

describe('authenticate：DB 查询异常', () => {
  it('返回 503 + DATABASE_UNAVAILABLE JSON，而不是纯文本 500', async () => {
    const app = appWith(reposThatThrow('connect ECONNREFUSED 164.30.21.203:9500', 'ECONNREFUSED'));

    const res = await app.request('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer sub-1' },
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(body.error.message).toContain('ECONNREFUSED');
    expect(body.error.message).toContain('[ECONNREFUSED]');
  });

  it('外发消息里抹掉连接串口令', async () => {
    const app = appWith(
      reposThatThrow('failed: postgres://root:%23123Aloento@164.30.21.203:9500/otunlink'),
    );

    const res = await app.request('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer sub-1' },
    });

    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain('123Aloento');
    expect(body.error.message).toContain('postgres://***@');
  });
});

describe('GET /auth/me：开户写入异常', () => {
  it('create 失败也返回 503 DATABASE_UNAVAILABLE', async () => {
    const repos = {
      users: {
        findByEntraSub: async () => null,
        create: () => {
          throw Object.assign(new Error('duplicate key value violates unique constraint'), {
            code: '23505',
          });
        },
      },
    } as unknown as Repos;

    const res = await appWith(repos).request('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer sub-new' },
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(body.error.message).toContain('[23505]');
  });
});

describe('resolveAudience', () => {
  const env = {
    ENTRA_TENANT_ID: 'tenant',
    ENTRA_CLIENT_ID: '0edca98e-17df-41f2-b254-a579095ffcb7',
    ENTRA_AUDIENCE: 'https://SoarCraft.onmicrosoft.com/OtunLink/API',
  } as never;

  it('同时接受配置的 scope 形式与 v2 令牌真实的 App ID URI（父级）', () => {
    const list = resolveAudience(env);
    expect(list).toContain('https://SoarCraft.onmicrosoft.com/OtunLink/API');
    // v2 访问令牌的 aud 不含 scope 段；不认父级 URI 会 401 → 前端踢回登录页形成循环。
    expect(list).toContain('https://SoarCraft.onmicrosoft.com/OtunLink');
  });

  it('保留 client id 的多种默认形式', () => {
    const list = resolveAudience(env);
    expect(list).toContain('0edca98e-17df-41f2-b254-a579095ffcb7');
    expect(list).toContain('api://0edca98e-17df-41f2-b254-a579095ffcb7');
    expect(list).toContain('api://0edca98e-17df-41f2-b254-a579095ffcb7/OtunLink.API');
  });

  it('没有末尾 scope 段时不产生重复项', () => {
    const list = resolveAudience({
      ENTRA_TENANT_ID: 'tenant',
      ENTRA_CLIENT_ID: 'cid',
      ENTRA_AUDIENCE: 'https://tenant.onmicrosoft.com',
    } as never);
    expect(list.filter((item) => item === 'https://tenant.onmicrosoft.com')).toHaveLength(1);
  });
});
