import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  acquireAccessToken,
  acquireAccessTokenResult,
  apiBaseUrl,
  fetchMe,
  type MeError,
  type MeUser,
  type TokenFailure,
} from '../api/client';
import { setTokenProvider, setUnauthorizedHandler } from '../api/http';
import { clearQueryCache } from '../api/queryClient';
import { envAuthConfig } from './msalConfig';
import { setReturnTo } from './returnTo';
import { clearAutoRedirect, markAutoRedirect, shouldAutoRedirect } from './silentRetry';

// 会话上下文：登录后拉取 /auth/me，并把 MSAL 令牌注入请求层。
// 401 时清空会话并跳转登录（由请求层回调触发）。
//
// 失败分类（error）：
// - 'unconfigured'：缺少 Entra 环境变量，登录不可用；
// - 'auth'：拿不到访问令牌且不属于网络问题（授权过期/需重新同意/账号失效）→ 需要重新登录；
// - 'server'：API 返回非 401/403（5xx、503、或压根连不上）→ 可重试；
// - 'session'：令牌被服务端拒绝，已清缓存，由守卫引导回登录页。

export type SessionErrorCode = 'unconfigured' | 'auth' | 'server' | 'session';

interface SessionContextValue {
  me: MeUser | null;
  loading: boolean;
  error: SessionErrorCode | null;
  /** 可复制的诊断信息（错误码 / HTTP 状态 / API 地址），直接显示在错误页上。 */
  errorDetail: string | null;
  reload: () => Promise<void>;
  /** 重新走一次交互式登录（清掉陈旧账号后整页重定向到 Entra）。 */
  signInAgain: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function currentPath(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

function describeTokenFailure(failure: TokenFailure): string {
  const parts: string[] = [failure.kind];
  if (failure.code) parts.push(failure.code);
  if (failure.subError) parts.push(failure.subError);
  if (failure.message) parts.push(failure.message.slice(0, 200));
  return parts.join(' · ');
}

function describeMeFailure(cause: MeError): string {
  const status = typeof cause.status === 'number' ? cause.status : 0;
  if (status === 0) return `网络不可达 · ${apiBaseUrl()}`;
  return `HTTP ${status}${cause.code ? ` · ${cause.code}` : ''}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const authenticated = useIsAuthenticated();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [me, setMe] = useState<MeUser | null>(null);
  // 初始为 true：登录成功回跳 / 后，在 /auth/me 返回前先展示 loading，避免先闪现到 /login。
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SessionErrorCode | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const activeAccount = useCallback(
    () => instance.getActiveAccount() ?? instance.getAllAccounts()[0],
    [instance],
  );

  // 会话失效：清空 MSAL 缓存使 authenticated 变为 false，从而由 RequireAuth 引导回登录页。
  // 同时清空查询缓存（内存 + IndexedDB），避免下一个账号读到上一个账号的残留数据。
  const expireSession = useCallback(async () => {
    setMe(null);
    setError('session');
    setErrorDetail(null);
    clearAutoRedirect();
    await clearQueryCache(queryClient);
    try {
      await instance.clearCache();
    } catch {
      // 清缓存失败仍视为会话失效，由守卫引导回登录。
    }
  }, [instance, queryClient]);

  const loadMe = useCallback(async () => {
    const config = envAuthConfig();
    if (!config) {
      setMe(null);
      setError('unconfigured');
      setErrorDetail(null);
      return;
    }
    setLoading(true);
    // 自动重定向已发出：页面即将离开，保持 loading 直到浏览器跳转，否则守卫会先闪一下错误页。
    let redirecting = false;
    try {
      const result = await acquireAccessTokenResult(instance, [config.apiScope]);
      if (!result.token) {
        const failure = result.failure ?? { kind: 'unknown' as const };

        // 需要交互才能拿到令牌：陈旧 account 不会自己恢复（localStorage 会一直保留它），
        // 因此这里主动整页重定向到 Entra 重新认证一次，失败次数由闸门限制，避免死循环。
        if (failure.kind === 'interaction-required' && shouldAutoRedirect()) {
          markAutoRedirect();
          setReturnTo(currentPath());
          try {
            await instance.acquireTokenRedirect({
              scopes: config.loginScopes,
              account: activeAccount(),
              redirectUri: config.msal.auth.redirectUri,
              claims: failure.claims,
            });
            redirecting = true;
            return; // 页面即将离开，保持 loading 直到浏览器跳转。
          } catch (cause) {
            const err = cause as { errorCode?: string; errorMessage?: string };
            setMe(null);
            setError('auth');
            setErrorDetail(
              [err?.errorCode, err?.errorMessage, describeTokenFailure(failure)]
                .filter((part): part is string => typeof part === 'string' && part.length > 0)
                .join(' · '),
            );
            return;
          }
        }

        setMe(null);
        // 断网/域名解析失败属于「连不上」，其余（scope/consent/账号问题）归入「需要重新登录」。
        setError(failure.kind === 'network' ? 'server' : 'auth');
        setErrorDetail(describeTokenFailure(failure));
        return;
      }

      clearAutoRedirect();
      try {
        const user = await fetchMe(apiBaseUrl(), result.token);
        setMe(user);
        setError(null);
        setErrorDetail(null);
      } catch (cause) {
        const err = cause as MeError;
        const status = typeof err.status === 'number' ? err.status : 0;
        if (status === 401 || status === 403) {
          // 令牌被服务端拒绝（aud/签名/过期等）：清会话，避免守卫无限互踢。
          await expireSession();
        } else {
          // 服务器/网络错误：保留会话，展示可重试的错误页。
          setMe(null);
          setError('server');
          setErrorDetail(describeMeFailure(err));
        }
      }
    } finally {
      if (!redirecting) setLoading(false);
    }
  }, [instance, expireSession, activeAccount]);

  // 重新登录：保留当前深链，清掉自动重定向计数后走交互式登录。
  const signInAgain = useCallback(() => {
    const config = envAuthConfig();
    if (!config) return;
    clearAutoRedirect();
    setReturnTo(currentPath());
    void instance.loginRedirect({
      scopes: config.loginScopes,
      account: activeAccount(),
      redirectUri: config.msal.auth.redirectUri,
    });
  }, [instance, activeAccount]);

  // 注入请求层：令牌提供者 + 401 处理。
  useEffect(() => {
    setTokenProvider(async () => {
      const config = envAuthConfig();
      if (!config) return null;
      return acquireAccessToken(instance, [config.apiScope]);
    });
    setUnauthorizedHandler(() => {
      void expireSession();
      setReturnTo(window.location.pathname + window.location.search + window.location.hash);
      navigate(LOGIN_FALLBACK, { replace: true });
    });
    return () => {
      setTokenProvider(async () => null);
      setUnauthorizedHandler(() => undefined);
    };
  }, [instance, navigate, expireSession]);

  useEffect(() => {
    if (authenticated && accounts.length > 0) {
      void loadMe();
    } else if (!authenticated) {
      setMe(null);
      setLoading(false);
    }
  }, [authenticated, accounts.length, loadMe]);

  const value = useMemo(
    () => ({ me, loading, error, errorDetail, reload: loadMe, signInAgain }),
    [me, loading, error, errorDetail, loadMe, signInAgain],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const LOGIN_FALLBACK = '/login';

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

/** 登出：先清空查询缓存（内存 + IndexedDB）再交给 MSAL 重定向，避免换账号后读到上一个账号的缓存。 */
export function useLogout(): () => void {
  const { instance } = useMsal();
  const queryClient = useQueryClient();
  return useCallback(() => {
    clearAutoRedirect();
    void clearQueryCache(queryClient).finally(() => {
      void instance.logoutRedirect();
    });
  }, [instance, queryClient]);
}
