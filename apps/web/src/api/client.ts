import {
  InteractionRequiredAuthError,
  type AuthError,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import type { UserRole, UserStatus } from '@otunlink/shared';

// 前端 API 客户端：/auth/me 与轻量鉴权辅助。

export interface MeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole | null;
  scopeUnitId: string | null;
  status: UserStatus;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

interface MeResponse {
  data: MeUser;
}

/** /auth/me 失败时抛出的错误：带 HTTP 状态码、原始响应体与信封里的 error.code。 */
export interface MeError extends Error {
  status?: number;
  body?: string;
  code?: string;
}

export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return configured ?? 'http://localhost:8787';
}

/**
 * 令牌获取失败的分类：决定下一步是「引导交互式登录」还是「提示网络/服务器异常」。
 * 之前的实现把所有异常一律吞成 null，于是「授权过期」和「连不上网」共用同一条
 * 「服务器或网络异常」文案，用户只能看到一句无解的死胡同提示。
 */
export type TokenFailureKind = 'no-account' | 'interaction-required' | 'network' | 'unknown';

export interface TokenFailure {
  kind: TokenFailureKind;
  /** MSAL 错误码（interaction_required / invalid_grant / network_error …）。 */
  code?: string;
  /** 原始错误信息（通常是 AAD 的 error_description）。 */
  message?: string;
  subError?: string;
  correlationId?: string;
  /** 条件访问挑战（CA claims）：交互式请求需原样回传，否则会被反复挑战。 */
  claims?: string;
}

export interface TokenResult {
  token: string | null;
  failure?: TokenFailure;
}

// 需要用户重新交互才能拿到令牌的错误码：
// - AAD 侧：interaction_required / consent_required / login_required / account_selection_required；
// - MSAL 本地侧：刷新令牌过期、缓存里没有可用令牌；
// - invalid_grant：AADSTS 系列（刷新令牌过期、改密、管理员撤销会话）统一落在该码上。
const INTERACTION_REQUIRED_CODES = new Set([
  'interaction_required',
  'consent_required',
  'login_required',
  'account_selection_required',
  'interrupted_user',
  'bad_token',
  'refresh_token_expired',
  'no_tokens_found',
  'native_account_unavailable',
  'invalid_grant',
]);

const NETWORK_ERROR_CODES = new Set(['network_error', 'no_network_connectivity']);

function describeTokenFailure(cause: unknown): TokenFailure {
  const err = cause as Partial<AuthError> & { claims?: string };
  const code = typeof err?.errorCode === 'string' ? err.errorCode : undefined;
  const message =
    typeof err?.errorMessage === 'string'
      ? err.errorMessage
      : cause instanceof Error
        ? cause.message
        : undefined;

  // 网络类先判定：断网/域名解析失败不应被当成「需要重新登录」。
  if (code !== undefined && NETWORK_ERROR_CODES.has(code)) {
    return { kind: 'network', code, message };
  }

  const interactionRequired =
    cause instanceof InteractionRequiredAuthError ||
    (code !== undefined && INTERACTION_REQUIRED_CODES.has(code));

  return {
    kind: interactionRequired ? 'interaction-required' : 'unknown',
    code,
    message,
    subError: typeof err?.subError === 'string' ? err.subError : undefined,
    correlationId: typeof err?.correlationId === 'string' ? err.correlationId : undefined,
    claims: typeof err?.claims === 'string' ? err.claims : undefined,
  };
}

/** 静默获取令牌，失败时返回结构化原因（不抛异常，由调用方决定后续动作）。 */
export async function acquireAccessTokenResult(
  instance: IPublicClientApplication,
  scopes: string[],
): Promise<TokenResult> {
  const accounts = instance.getAllAccounts();
  const account = instance.getActiveAccount() ?? accounts[0];
  if (!account) return { token: null, failure: { kind: 'no-account' } };

  try {
    const res = await instance.acquireTokenSilent({ scopes, account });
    return { token: res.accessToken };
  } catch (cause) {
    const failure = describeTokenFailure(cause);
    // 静默失败不再静默：把错误码打到控制台，便于区分「授权过期」与「接口 5xx」。
    // eslint-disable-next-line no-console
    console.warn('[auth] 静默获取访问令牌失败', failure);
    return { token: null, failure };
  }
}

/** 静默获取 API 访问令牌；失败时返回 null（请求层 tokenProvider 用的简化签名）。 */
export async function acquireAccessToken(
  instance: IPublicClientApplication,
  scopes: string[],
): Promise<string | null> {
  const result = await acquireAccessTokenResult(instance, scopes);
  return result.token;
}

/** 从 API 错误信封里取 error.code（{ error: { code, message } }）。 */
function extractErrorCode(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } };
    return typeof parsed.error?.code === 'string' ? parsed.error.code : undefined;
  } catch {
    return undefined;
  }
}

/** 调用 GET /api/v1/auth/me。失败时抛出带 HTTP 状态码与错误码的错误（供调用方区分鉴权/服务器故障）。 */
export async function fetchMe(baseUrl: string, token: string): Promise<MeUser> {
  const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = new Error(`/auth/me 请求失败：HTTP ${res.status}`) as MeError;
    err.status = res.status;
    try {
      err.body = await res.text();
      err.code = extractErrorCode(err.body);
    } catch {
      // 忽略读取失败（例如测试替身没有 text()）。
    }
    throw err;
  }
  const body = (await res.json()) as MeResponse;
  return body.data;
}
