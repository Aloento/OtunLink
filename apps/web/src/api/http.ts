import { ErrorCodes } from '@otunlink/shared';

import { apiBaseUrl } from './client';

// 请求层封装（ck-03）：
// - 自动附带 Bearer token（由 SessionProvider 注入 MSAL acquireTokenSilent）
// - 解析 API 统一响应信封 { data } / { error: { code, message, details } }
// - 错误码 → i18n 文案键映射（errors.*）
// - 401 触发未授权回调（跳转登录）

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(
    message: string,
    opts: { code?: string; details?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = opts.code ?? 'UNKNOWN';
    this.details = opts.details;
    this.status = opts.status ?? 0;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; details?: unknown };
}

/** 按 HTTP 状态兜底错误码（响应体缺少 error 时）。 */
export function fallbackCodeForStatus(status: number): string {
  if (status === 401) return ErrorCodes.UNAUTHORIZED;
  if (status === 403) return ErrorCodes.FORBIDDEN;
  if (status === 404) return ErrorCodes.NOT_FOUND;
  return ErrorCodes.INTERNAL_ERROR;
}

/** 解析 API 响应：成功返回 data；失败抛出 ApiError。 */
export async function parseApiResponse<T>(res: Response): Promise<T> {
  const raw: ApiEnvelope<T> | null = await res.json().catch(() => null);

  if (res.ok) {
    if (raw && raw.data !== undefined) return raw.data;
    throw new ApiError(`响应缺少 data 字段：HTTP ${res.status}`, { status: res.status });
  }

  const err = raw?.error;
  const code = err?.code ?? fallbackCodeForStatus(res.status);
  throw new ApiError(err?.message ?? `请求失败：HTTP ${res.status}`, {
    code,
    details: err?.details,
    status: res.status,
  });
}

const CODE_TO_I18N_KEY: Record<string, string> = {
  [ErrorCodes.VALIDATION_ERROR]: 'errors.VALIDATION_ERROR',
  [ErrorCodes.UNAUTHORIZED]: 'errors.UNAUTHORIZED',
  [ErrorCodes.FORBIDDEN]: 'errors.FORBIDDEN',
  [ErrorCodes.NOT_FOUND]: 'errors.NOT_FOUND',
  [ErrorCodes.CONFLICT]: 'errors.CONFLICT',
  [ErrorCodes.INTERNAL_ERROR]: 'errors.INTERNAL_ERROR',
  [ErrorCodes.DATABASE_UNAVAILABLE]: 'errors.DATABASE_UNAVAILABLE',
  [ErrorCodes.AUTH_CONFIGURATION_ERROR]: 'errors.AUTH_CONFIGURATION_ERROR',
  [ErrorCodes.MIGRATION_DISABLED]: 'errors.MIGRATION_DISABLED',
  [ErrorCodes.MIGRATION_UNAVAILABLE]: 'errors.MIGRATION_UNAVAILABLE',
  [ErrorCodes.MIGRATION_FAILED]: 'errors.MIGRATION_FAILED',
  [ErrorCodes.BARCODE_CONFLICT]: 'errors.BARCODE_CONFLICT',
  [ErrorCodes.TRACKING_CONFLICT]: 'errors.TRACKING_CONFLICT',
  [ErrorCodes.SHIPMENT_STATE_CONFLICT]: 'errors.SHIPMENT_STATE_CONFLICT',
  [ErrorCodes.COUNTING_STATE_CONFLICT]: 'errors.COUNTING_STATE_CONFLICT',
  [ErrorCodes.REVIEW_ALREADY_PROCESSED]: 'errors.REVIEW_ALREADY_PROCESSED',
  [ErrorCodes.REVIEW_NO_DIFFERENCE]: 'errors.REVIEW_NO_DIFFERENCE',
  [ErrorCodes.FILE_INVALID]: 'errors.FILE_INVALID',
  [ErrorCodes.FILE_TOO_LARGE]: 'errors.FILE_TOO_LARGE',
  [ErrorCodes.STORAGE_UNAVAILABLE]: 'errors.STORAGE_UNAVAILABLE',
  NETWORK: 'errors.NETWORK',
};

/** 将错误码映射为 i18n 文案键；未知码回退 UNKNOWN。 */
export function errorI18nKey(code: string | undefined): string {
  if (!code) return 'errors.UNKNOWN';
  return CODE_TO_I18N_KEY[code] ?? 'errors.UNKNOWN';
}

type TokenProvider = () => Promise<string | null>;
type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider = async () => null;
let unauthorizedHandler: UnauthorizedHandler = () => undefined;

/** 由 SessionProvider 注入：获取当前 API 访问令牌。 */
export function setTokenProvider(fn: TokenProvider): void {
  tokenProvider = fn;
}

/** 由 SessionProvider 注入：401 时跳转登录。 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler): void {
  unauthorizedHandler = fn;
}

/** 通用请求：附带 token、解析信封、处理 401 与网络异常。 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenProvider();
  if (!token) {
    unauthorizedHandler();
    throw new ApiError('未登录', { code: ErrorCodes.UNAUTHORIZED, status: 401 });
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body !== undefined && !headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('网络异常', { code: 'NETWORK', status: 0 });
  }

  if (res.status === 401) {
    unauthorizedHandler();
  }
  return parseApiResponse<T>(res);
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}
