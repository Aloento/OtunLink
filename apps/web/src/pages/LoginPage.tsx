import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { Body1, Button, Title1 } from '@fluentui/react-components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { envAuthConfig } from '../auth/msalConfig';

export function LoginPage() {
  const { instance } = useMsal();
  const authenticated = useIsAuthenticated();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const config = envAuthConfig();

  const login = () => {
    if (!config) return;
    // redirectStartPage：回调后 MSAL 回跳到登录发起页；直接回首页，
    // 由 RequireActive 决定进系统还是 PENDING 引导页。
    instance.loginRedirect({ scopes: config.loginScopes, redirectStartPage: '/' });
  };

  // 已登录时（例如用户手动访问 /login）自动进入系统。
  useEffect(() => {
    if (authenticated) navigate('/', { replace: true });
  }, [authenticated, navigate]);

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
