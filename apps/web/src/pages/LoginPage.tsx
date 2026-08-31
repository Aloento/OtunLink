import { useMsal } from '@azure/msal-react';
import { Body1, Button, Title1 } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';

import { envAuthConfig } from '../auth/msalConfig';

export function LoginPage() {
  const { instance } = useMsal();
  const { t } = useTranslation();
  const config = envAuthConfig();

  const login = () => {
    if (!config) return;
    instance.loginRedirect({ scopes: config.loginScopes });
  };

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
