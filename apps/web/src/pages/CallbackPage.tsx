import { useIsAuthenticated } from '@azure/msal-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { consumeReturnTo } from '../auth/returnTo';
import { Spinner } from '../ui/spinner';

// /auth/callback 仅用于接收 MSAL 重定向（authorize 302 带回 #code/state）。
// 本页必须保持 URL 原样不动，MSAL 的 handleRedirectPromise 从 window.location.hash 解析 code。
// 因 AuthProvider 以 handleRedirectPromise({ navigateToLoginRequestUrl: false }) 处理，MSAL 会在此页
// 当场完成兑换并清理状态，不再整页跳回起始页；因此这里在登录成功后由 SPA 路由跳转到首页。
export function CallbackPage() {
  const { t } = useTranslation();
  const authenticated = useIsAuthenticated();
  const navigate = useNavigate();

  useEffect(() => {
    if (authenticated) {
      // 若此前因未登录被引导到 /login 并暂存了深链，登录成功后优先恢复（defect #9）。
      navigate(consumeReturnTo() ?? '/', { replace: true });
    }
  }, [authenticated, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {/* 整屏加载态：由 <h1> 承载这一句状态文案，Spinner 不再重复传 label，
          否则同一句话会被读两遍（Spinner 的 role="status" 会再播报一次）。 */}
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        {t('callback.message')}
      </h1>
      <Spinner size="lg" />
    </div>
  );
}
