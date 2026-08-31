import type { IPublicClientApplication } from '@azure/msal-browser';
import type { UserRole, UserStatus } from '@otunlink/shared';

// 前端 API 客户端（ck-02 范围）：/auth/me 与轻量鉴权辅助。

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

export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return configured ?? 'http://localhost:8787';
}

/** 静默获取 API 访问令牌；失败时返回 null（由调用方引导重新登录）。 */
export async function acquireAccessToken(
  instance: IPublicClientApplication,
  scopes: string[],
): Promise<string | null> {
  const accounts = instance.getAllAccounts();
  const account = instance.getActiveAccount() ?? accounts[0] ?? undefined;
  if (!account) return null;
  try {
    const res = await instance.acquireTokenSilent({ scopes, account });
    return res.accessToken;
  } catch {
    return null;
  }
}

/** 调用 GET /api/v1/auth/me。 */
export async function fetchMe(baseUrl: string, token: string): Promise<MeUser> {
  const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`/auth/me 请求失败：HTTP ${res.status}`);
  }
  const body = (await res.json()) as MeResponse;
  return body.data;
}
