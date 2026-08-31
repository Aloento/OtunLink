import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { Body1, Button, Title1 } from '@fluentui/react-components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { envAuthConfig } from '../auth/msalConfig';
import { consumeReturnTo } from '../auth/returnTo';
import { useSession } from '../auth/SessionProvider';

export function LoginPage() {
  const { instance } = useMsal();
  const authenticated = useIsAuthenticated();
  const { me } = useSession();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const config = envAuthConfig();

  const login = () => {
    if (!config) return;
    // AuthProvider 以 handleRedirectPromise({ navigateToLoginRequestUrl: false }) 处理回调，
    // MSAL 在回调页当场完成兑换，不再回跳到登录发起页；登录成功后由 CallbackPage 跳转首页，
    // 由 RequireActive 决定进系统还是 PENDING 引导页。
    instance.loginRedirect({ scopes: config.loginScopes });
  };

  // 已登录且会话可用时（例如用户手动访问 /login）自动进入系统。
  // 仅凭 authenticated 就回首页会在「有 account 但 /auth/me 失败」时与 RequireActive 互相导航。
  // 若此前因未登录被引导到 /login，则优先恢复暂存的深链路径（defect #9）。
  useEffect(() => {
    if (authenticated && me !== null) {
      navigate(consumeReturnTo() ?? '/', { replace: true });
    }
  }, [authenticated, me, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title1 as="h1">{t('app.name')}</Title1>
      {config ? (
        <>
          <Body1>{t('login.description')}</Body1>
          <Button appearance="primary" onClick={login}>
            {t('login.button')}
          </Button>
        </>
      ) : (
        <Body1>{t('login.unconfigured')}</Body1>
      )}
    </div>
  );
}
