import { Body1, Spinner } from '@fluentui/react-components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

// /auth/callback 仅用于接收 MSAL 重定向；AuthProvider 完成 handleRedirectPromise
// 后才挂载本页面，因此可立即回到首页。
export function CallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Spinner />
      <Body1>{t('callback.message')}</Body1>
    </div>
  );
}
