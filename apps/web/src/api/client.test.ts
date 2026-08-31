import { describe, expect, it, vi } from 'vitest';

import { acquireAccessToken, fetchMe } from './client';

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
});

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
