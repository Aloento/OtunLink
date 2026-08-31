import { Body1, Spinner } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';

// /auth/callback 仅用于接收 MSAL 重定向（authorize 302 带回 #code/state）。
// 关键：本页必须保持 URL 原样不动 —— MSAL 的 handleRedirectPromise 从
// window.location.hash 解析 code，成功后默认会回跳到登录发起页
// （navigateToLoginRequestUrl），因此这里不做任何导航。
export function CallbackPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Spinner />
      <Body1>{t('callback.message')}</Body1>
    </div>
  );
}
