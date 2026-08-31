import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { acquireAccessToken, apiBaseUrl, fetchMe, type MeUser } from '../api/client';
import { setTokenProvider, setUnauthorizedHandler } from '../api/http';
import { envAuthConfig } from './msalConfig';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const config = envAuthConfig();
    if (!config) {
      setMe(null);
      setLoading(false);
      setError('unconfigured');
      return;
    }
    setLoading(true);
    const token = await acquireAccessToken(instance, [config.apiScope]);
    if (!token) {
      setMe(null);
      setLoading(false);
      setError('token');
      return;
    }
    try {
      const user = await fetchMe(apiBaseUrl(), token);
      setMe(user);
      setError(null);
    } catch (e) {
      setMe(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [instance]);

  // 注入请求层：令牌提供者 + 401 处理。
  useEffect(() => {
    setTokenProvider(async () => {
      const config = envAuthConfig();
      if (!config) return null;
      return acquireAccessToken(instance, [config.apiScope]);
    });
    setUnauthorizedHandler(() => {
      setMe(null);
      navigate(LOGIN_FALLBACK, { replace: true });
    });
    return () => {
      setTokenProvider(async () => null);
      setUnauthorizedHandler(() => undefined);
    };
  }, [instance, navigate]);

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
