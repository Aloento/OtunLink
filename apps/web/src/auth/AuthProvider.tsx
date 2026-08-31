import type { IPublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { Spinner } from '@fluentui/react-components';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// 启动时处理登录重定向回调（auth code + PKCE 兑换），完成后挂载 MSAL 上下文。
export function AuthProvider({
  instance,
  children,
}: {
  instance: IPublicClientApplication;
  children: ReactNode;
}) {
  const [booting, setBooting] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    instance
      .handleRedirectPromise()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instance]);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}
