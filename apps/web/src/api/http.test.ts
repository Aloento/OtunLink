import { ErrorCodes } from '@otunlink/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  apiRequest,
  errorI18nKey,
  fallbackCodeForStatus,
  parseApiResponse,
  setTokenProvider,
  setUnauthorizedHandler,
} from './http';

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenProvider(async () => null);
  setUnauthorizedHandler(() => undefined);
});

describe('parseApiResponse', () => {
  it('returns data on ok', async () => {
    const res = { ok: true, status: 200, json: async () => ({ data: { id: 1 } }) } as Response;
    await expect(parseApiResponse(res)).resolves.toEqual({ id: 1 });
  });

  it('throws ApiError with the envelope error code', async () => {
    const res = {
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'bad' } }),
    } as Response;
    const err = await parseApiResponse(res).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect((err as ApiError).status).toBe(400);
  });

  it('falls back to a status-derived code when the body has no error', async () => {
    const res = { ok: false, status: 401, json: async () => null } as Response;
    const err = await parseApiResponse(res).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe(ErrorCodes.UNAUTHORIZED);
  });
});

describe('errorI18nKey', () => {
  it('maps known codes to i18n keys', () => {
    expect(errorI18nKey('VALIDATION_ERROR')).toBe('errors.VALIDATION_ERROR');
    expect(errorI18nKey('UNAUTHORIZED')).toBe('errors.UNAUTHORIZED');
    expect(errorI18nKey('NETWORK')).toBe('errors.NETWORK');
  });

  it('falls back to UNKNOWN for unknown or missing codes', () => {
    expect(errorI18nKey('SOMETHING_ELSE')).toBe('errors.UNKNOWN');
    expect(errorI18nKey(undefined)).toBe('errors.UNKNOWN');
  });
});

describe('fallbackCodeForStatus', () => {
  it('maps 401/403/404 and defaults to INTERNAL_ERROR', () => {
    expect(fallbackCodeForStatus(401)).toBe(ErrorCodes.UNAUTHORIZED);
    expect(fallbackCodeForStatus(403)).toBe(ErrorCodes.FORBIDDEN);
    expect(fallbackCodeForStatus(404)).toBe(ErrorCodes.NOT_FOUND);
    expect(fallbackCodeForStatus(500)).toBe(ErrorCodes.INTERNAL_ERROR);
  });
});

describe('apiRequest', () => {
  it('attaches a Bearer token and parses the data envelope', async () => {
    setTokenProvider(async () => 'tok-123');
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { ok: true } }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/items')).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8787/items');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok-123');
  });

  it('throws a NETWORK ApiError when fetch rejects', async () => {
    setTokenProvider(async () => 'tok');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const err = await apiRequest('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK');
  });

  it('invokes the unauthorized handler on 401', async () => {
    setTokenProvider(async () => 'tok');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED' } }),
      }),
    );

    await apiRequest('/x').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('throws UNAUTHORIZED without calling fetch when no token is available', async () => {
    setTokenProvider(async () => null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const err = await apiRequest('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(ErrorCodes.UNAUTHORIZED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
