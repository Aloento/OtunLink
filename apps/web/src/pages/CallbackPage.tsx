import { useIsAuthenticated } from '@azure/msal-react';
import { Body1, Spinner } from '@fluentui/react-components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// /auth/callback 仅用于接收 MSAL 重定向（authorize 302 带回 #code/state）。
// 本页必须保持 URL 原样不动，MSAL 的 handleRedirectPromise 从 window.location.hash 解析 code。
// 因 msalConfig 设 system.navigateToLoginRequestUrl = false，MSAL 会在此页当场完成兑换并清理状态，
// 不再整页跳回起始页；因此这里在登录成功后由 SPA 路由跳转到首页。
export function CallbackPage() {
  const { t } = useTranslation();
  const authenticated = useIsAuthenticated();
  const navigate = useNavigate();

  useEffect(() => {
    if (authenticated) navigate('/', { replace: true });
  }, [authenticated, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Spinner />
      <Body1>{t('callback.message')}</Body1>
    </div>
  );
}
