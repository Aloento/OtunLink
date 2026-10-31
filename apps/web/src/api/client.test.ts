import { describe, expect, it, vi } from 'vitest';

import { acquireAccessToken, acquireAccessTokenResult, fetchMe } from './client';

describe('fetchMe', () => {
  it('返回 /auth/me 的 data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'u1', status: 'PENDING' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const me = await fetchMe('http://localhost:8787', 'token-1');
    expect(me).toMatchObject({ id: 'u1', status: 'PENDING' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/api/v1/auth/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer token-1' } }),
    );
  });

  it('非 2xx 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchMe('http://localhost:8787', 'bad')).rejects.toThrow('/auth/me 请求失败');
  });

  // 修复前的错误页分不清「令牌被拒」与「服务器 5xx」，因为 fetchMe 只抛一句 message。
  // 现在把 HTTP 状态与信封里的 error.code 一并带出，供错误页展示与前端分支判定。
  it('5xx 时附带 status 与信封 error.code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () =>
          JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
      }),
    );

    const err = await fetchMe('http://localhost:8787', 'token-1').catch((e) => e);
    expect(err).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('响应体不是 JSON 时仍保留 status，不因解析失败而丢掉诊断信息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => '<html>bad gateway' }),
    );

    const err = await fetchMe('http://localhost:8787', 'token-1').catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.code).toBeUndefined();
  });
});

function instanceWith(overrides: Record<string, unknown>) {
  return {
    getAllAccounts: () => [{ homeAccountId: 'a' }],
    getActiveAccount: () => ({ homeAccountId: 'a' }),
    acquireTokenSilent: vi.fn(),
    ...overrides,
  } as never;
}

type Instance = Parameters<typeof acquireAccessTokenResult>[0];

describe('acquireAccessToken', () => {
  it('无账号时返回 null', async () => {
    const instance = {
      getAllAccounts: () => [],
      getActiveAccount: () => null,
      acquireTokenSilent: vi.fn(),
    } as never;
    await expect(
      acquireAccessToken(instance as Parameters<typeof acquireAccessToken>[0], ['x']),
    ).resolves.toBeNull();
  });
});

describe('acquireAccessTokenResult（失败分类）', () => {
  it('成功时返回令牌且无 failure', async () => {
    const instance = instanceWith({
      acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'at-1' }),
    });
    await expect(acquireAccessTokenResult(instance as Instance, ['s'])).resolves.toEqual({
      token: 'at-1',
    });
  });

  it('无账号 → no-account，且不调用静默接口', async () => {
    const acquireTokenSilent = vi.fn();
    const instance = {
      getAllAccounts: () => [],
      getActiveAccount: () => null,
      acquireTokenSilent,
    } as never;
    const result = await acquireAccessTokenResult(instance as Instance, ['s']);
    expect(result.token).toBeNull();
    expect(result.failure?.kind).toBe('no-account');
    expect(acquireTokenSilent).not.toHaveBeenCalled();
  });

  // 授权类错误：以前被 `catch { return null }` 吞成「服务器或网络异常」，
  // 用户看到的是一句无解提示。现在必须归类为 interaction-required，触发交互式重登。
  it.each(['interaction_required', 'consent_required', 'login_required', 'invalid_grant'])(
    '%s → interaction-required',
    async (errorCode) => {
      const instance = instanceWith({
        acquireTokenSilent: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('nope'), { errorCode })),
      });
      const result = await acquireAccessTokenResult(instance as Instance, ['s']);
      expect(result.token).toBeNull();
      expect(result.failure).toMatchObject({ kind: 'interaction-required', code: errorCode });
    },
  );

  // 断网不能被当成「授权过期」：否则会把连不上 API 的用户送去重新登录，
  // 登录同样失败，形成"登录不上"的观感。
  it.each(['network_error', 'no_network_connectivity'])('%s → network', async (errorCode) => {
    const instance = instanceWith({
      acquireTokenSilent: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('offline'), { errorCode })),
    });
    const result = await acquireAccessTokenResult(instance as Instance, ['s']);
    expect(result.failure).toMatchObject({ kind: 'network', code: errorCode });
  });

  it('未知错误 → unknown，并保留 message', async () => {
    const instance = instanceWith({
      acquireTokenSilent: vi.fn().mockRejectedValue(Object.assign(new Error('weird'), {
        errorCode: 'something_else',
      })),
    });
    const result = await acquireAccessTokenResult(instance as Instance, ['s']);
    expect(result.failure).toMatchObject({ kind: 'unknown', code: 'something_else' });
  });

  it('保留条件访问挑战 claims 以便交互式请求回传', async () => {
    const instance = instanceWith({
      acquireTokenSilent: vi.fn().mockRejectedValue(
        Object.assign(new Error('ca'), { errorCode: 'interaction_required', claims: '{"x":1}' }),
      ),
    });
    const result = await acquireAccessTokenResult(instance as Instance, ['s']);
    expect(result.failure?.claims).toBe('{"x":1}');
  });
});
