import { Button, Body1, Title1 } from '@fluentui/react-components';
import { useMsal } from '@azure/msal-react';
import { APP_NAME } from '@otunlink/shared';

import { envAuthConfig } from '../auth/msalConfig';

export function LoginPage() {
  const { instance } = useMsal();
  const config = envAuthConfig();

  const login = () => {
    if (!config) return;
    const { loginScopes } = config;
    instance.loginRedirect({ scopes: loginScopes });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title1 as="h1">{APP_NAME}</Title1>
      {config ? (
        <>
          <Body1>使用公司 Entra ID（Microsoft 365）账号登录</Body1>
          <Button appearance="primary" onClick={login}>
            登录
          </Button>
        </>
      ) : (
        <Body1>
          未配置 Entra ID 环境变量（VITE_ENTRA_TENANT_ID / VITE_ENTRA_CLIENT_ID），
          请参考 docs/auth-setup.md。
        </Body1>
      )}
    </div>
  );
}
