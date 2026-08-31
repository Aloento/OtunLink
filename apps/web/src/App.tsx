import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { Spinner } from '@fluentui/react-components';
import { useCallback, useEffect, useState } from 'react';

import { acquireAccessToken, apiBaseUrl, fetchMe, type MeUser } from './api/client';
import { envAuthConfig } from './auth/msalConfig';
import { selectView } from './auth/view';
import { CallbackPage } from './pages/CallbackPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PendingPage } from './pages/PendingPage';

export default function App() {
  const { instance, accounts } = useMsal();
  const authenticated = useIsAuthenticated();
  const [me, setMe] = useState<MeUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pathname = window.location.pathname;

  const loadMe = useCallback(async () => {
    const config = envAuthConfig();
    if (!config) {
      setError('未配置 Entra ID 环境变量');
      return;
    }
    const token = await acquireAccessToken(instance, [config.apiScope]);
    if (!token) {
      setError('无法获取访问令牌，请重新登录');
      return;
    }
    try {
      const user = await fetchMe(apiBaseUrl(), token);
      setMe(user);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [instance]);

  useEffect(() => {
    if (authenticated && accounts.length > 0) {
      void loadMe();
    }
  }, [authenticated, accounts.length, loadMe]);

  // /auth/callback 仅用于接收重定向，处理完立即回到首页。
  useEffect(() => {
    if (pathname.endsWith('/auth/callback')) {
      window.location.replace('/');
    }
  }, [pathname]);

  if (pathname.endsWith('/auth/callback')) {
    return <CallbackPage />;
  }

  const view = selectView(pathname, authenticated, me?.status ?? null);

  if (view === 'login') return <LoginPage />;
  if (view === 'loading' || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label={error ?? '正在加载账号信息…'} />
      </div>
    );
  }
  if (view === 'pending') return <PendingPage me={me} onRefresh={loadMe} />;
  return <HomePage me={me} />;
}
