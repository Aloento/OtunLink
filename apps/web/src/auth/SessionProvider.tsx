import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { acquireAccessToken, apiBaseUrl, fetchMe, type MeUser } from '../api/client';
import { setTokenProvider, setUnauthorizedHandler } from '../api/http';
import { envAuthConfig } from './msalConfig';
import { setReturnTo } from './returnTo';

// 会话上下文：登录后拉取 /auth/me，并把 MSAL 令牌注入请求层。
// 401 时清空会话并跳转登录（由请求层回调触发）。

interface SessionContextValue {
  me: MeUser | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const authenticated = useIsAuthenticated();
  const navigate = useNavigate();

  const [me, setMe] = useState<MeUser | null>(null);
  // 初始为 true：登录成功回跳 / 后，在 /auth/me 返回前先展示 loading，避免先闪现到 /login。
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 会话失效：清空 MSAL 缓存使 authenticated 变为 false，从而由 RequireAuth 引导回登录页。
  const expireSession = useCallback(async () => {
    setMe(null);
    setError('session');
    try {
      await instance.clearCache();
    } catch {
      // 清缓存失败仍视为会话失效，由守卫引导回登录。
    }
  }, [instance]);

  const loadMe = useCallback(async () => {
    const config = envAuthConfig();
    if (!config) {
      setMe(null);
      setError('unconfigured');
      return;
    }
    setLoading(true);
    try {
      const token = await acquireAccessToken(instance, [config.apiScope]);
      if (!token) {
        // 资源 scope / consent 异常（例如 API scope 配置不匹配）会导致 acquireTokenSilent 失败，
        // 但这不一定意味着账户本身无效；不要直接清空 MSAL 缓存，否则会把用户踢回登录页并
        // 让可恢复的授权问题变成循环登录。
        setMe(null);
        setError('token');
        return;
      }
      try {
        const user = await fetchMe(apiBaseUrl(), token);
        setMe(user);
        setError(null);
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        if (status === 401 || status === 403) {
          // 令牌被服务端拒绝（aud/签名/过期等）：清会话，避免守卫无限互踢。
          await expireSession();
        } else {
          // 服务器/网络错误：保留会话，展示可重试的错误页。
          setMe(null);
          setError('server');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [instance, expireSession]);

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
    () => ({ me, loading, error, reload: loadMe }),
    [me, loading, error, loadMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const LOGIN_FALLBACK = '/login';

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
