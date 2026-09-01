import { createLocalJWKSet, jwtVerify, type JWK } from 'jose';
import { ErrorCodes } from '@otunlink/shared';

import type { Env, TokenClaims } from '../types';

// Entra ID JWT 校验。
// - JWKS 从 `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys` 获取；
// - 优先 KV（JWKS_CACHE，24h TTL）缓存，KV 不可用或读取失败时降级到模块内存缓存，
//   内存也失效时直连 issuer 重新拉取（均有注释说明）。

const JWKS_CACHE_KEY = 'entra-jwks';
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedJwks {
  keys: JWK[];
  fetchedAt: number;
}

// 内存降级缓存（KV 不可用时的兜底；进程/isolate 级，重启后失效）。
const memoryCache = new Map<string, CachedJwks>();

export class AuthConfigError extends Error {
  readonly code = ErrorCodes.AUTH_CONFIGURATION_ERROR;
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

async function fetchJwksFromIssuer(tenantId: string): Promise<{ keys: JWK[] }> {
  const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Entra JWKS: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { keys?: JWK[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('Entra JWKS response is missing keys');
  }
  return { keys: body.keys };
}

export async function getJwks(env: Env, tenantId: string): Promise<{ keys: JWK[] }> {
  const now = Date.now();
  const kv = env.JWKS_CACHE;

  // 1) KV 缓存（生产推荐）。
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') {
    try {
      const cached = (await kv.get(JWKS_CACHE_KEY, 'json')) as CachedJwks | null;
      if (cached && Array.isArray(cached.keys) && now - cached.fetchedAt < JWKS_TTL_MS) {
        return { keys: cached.keys };
      }
    } catch {
      // KV 读取失败（未绑定/权限不足）→ 降级内存/直连，不阻断登录。
    }
  }

  // 2) 内存降级缓存。
  const cachedMem = memoryCache.get(tenantId);
  if (cachedMem && now - cachedMem.fetchedAt < JWKS_TTL_MS) {
    return { keys: cachedMem.keys };
  }

  // 3) 直连 issuer 拉取并回写两级缓存。
  const fresh = await fetchJwksFromIssuer(tenantId);
  const entry: CachedJwks = { keys: fresh.keys, fetchedAt: now };
  memoryCache.set(tenantId, entry);

  if (kv && typeof kv.put === 'function') {
    try {
      await kv.put(JWKS_CACHE_KEY, JSON.stringify(entry), {
        expirationTtl: Math.floor(JWKS_TTL_MS / 1000),
      });
    } catch {
      // 回写 KV 失败可忽略，下次请求走内存/直连。
    }
  }

  return fresh;
}

function resolveAudience(env: Env): string[] {
  const audience = env.ENTRA_AUDIENCE;
  const clientId = env.ENTRA_CLIENT_ID;
  const result: string[] = [];
  // 配置的 audience（发布者域形式，如 https://tenant.onmicrosoft.com/OtunLink/API）。
  if (typeof audience === 'string' && audience.length > 0) result.push(audience);
  if (typeof clientId === 'string' && clientId.length > 0) {
    // 裸 client id（guid）与默认 App ID URI 形式 api://<client-id> 一并接受，
    // 覆盖「Expose an API」用默认 URI 或自定义 URI 两种 Azure 配置，避免改 Azure Portal。
    if (!result.includes(clientId)) result.push(clientId);
    const defaultAppIdUri = `api://${clientId}`;
    if (!result.includes(defaultAppIdUri)) result.push(defaultAppIdUri);
  }
  return result;
}

function toClaims(payload: Record<string, unknown>): TokenClaims {
  const sub = payload.sub ?? payload.oid;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new Error('Token is missing sub/oid claim');
  }
  const email = payload.email ?? payload.preferred_username ?? payload.upn;
  const name = payload.name ?? email ?? sub;
  const preferredUsername =
    typeof payload.preferred_username === 'string' ? payload.preferred_username : undefined;
  const oid = typeof payload.oid === 'string' ? payload.oid : undefined;
  return {
    sub,
    oid,
    email: typeof email === 'string' ? email : undefined,
    name: typeof name === 'string' ? name : sub,
    preferredUsername,
  };
}

/**
 * 校验 Entra ID 访问令牌，返回标准化 claims。
 * 校验 iss（本租户）、aud（API scope/客户端 id）、exp 与签名。
 */
export async function verifyEntraToken(env: Env, token: string): Promise<TokenClaims> {
  const tenantId = env.ENTRA_TENANT_ID;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new AuthConfigError('ENTRA_TENANT_ID is not configured');
  }

  const audience = resolveAudience(env);
  if (audience.length === 0) {
    throw new AuthConfigError('ENTRA_AUDIENCE / ENTRA_CLIENT_ID is not configured');
  }

  const issuer =
    typeof env.ENTRA_ISSUER === 'string' && env.ENTRA_ISSUER.length > 0
      ? env.ENTRA_ISSUER
      : `https://login.microsoftonline.com/${tenantId}/v2.0`;

  const jwks = await getJwks(env, tenantId);
  const keySet = createLocalJWKSet(jwks);

  let payload: Record<string, unknown>;
  try {
    const res = await jwtVerify(token, keySet, {
      issuer,
      audience,
      algorithms: ['RS256', 'RS384', 'PS256', 'PS384'],
    });
    payload = res.payload as Record<string, unknown>;
  } catch (error) {
    // TODO(debug): 临时诊断，输出 token 声明的 aud/iss/scp/oid，定位 audience 不匹配。
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const json = Buffer.from(parts[1], 'base64url').toString('utf8');
        const claims = JSON.parse(json) as Record<string, unknown>;
        console.log(
          '[auth-debug] aud=', claims.aud, 'iss=', claims.iss, 'scp=', claims.scp, 'oid=', claims.oid,
        );
      }
    } catch {
      // 解码失败忽略，保留原始错误。
    }
    throw error;
  }

  return toClaims(payload as Record<string, unknown>);
}
