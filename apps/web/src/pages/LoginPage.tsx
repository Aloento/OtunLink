import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { Body1, Button, Caption1, Title1 } from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { envAuthConfig } from '../auth/msalConfig';
import {
  clearAuthRedirectError,
  formatAuthRedirectError,
  getAuthRedirectError,
  type AuthRedirectError,
} from '../auth/redirectError';
import { consumeReturnTo } from '../auth/returnTo';
import { useSession } from '../auth/SessionProvider';
import { Copyright } from '../components/Copyright';

export function LoginPage() {
  const { instance } = useMsal();
  const authenticated = useIsAuthenticated();
  const { me, error, errorDetail } = useSession();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const config = envAuthConfig();

  // 上一次登录回跳失败的原因（AADSTS/consent_required/access_denied 等）。
  // 没有这块信息时，用户「点登录 → 回到应用 → 又停在登录页」完全无从判断。
  const [redirectError, setRedirectError] = useState<AuthRedirectError | null>(() =>
    getAuthRedirectError(),
  );
  useEffect(() => {
    setRedirectError(getAuthRedirectError());
  }, []);

  const login = () => {
    if (!config) return;
    // 重新发起登录即视为用户已知晓上次失败原因，清掉残留提示避免误导。
    clearAuthRedirectError();
    setRedirectError(null);
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

  const detailText =
    redirectError !== null
      ? formatAuthRedirectError(redirectError)
      : error === 'auth'
        ? errorDetail
        : null;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <img src="/icons/logo.png" alt="" className="h-20 w-20 shrink-0" />
        <Title1 as="h1">{t('app.name')}</Title1>
        {config ? (
          <>
            <Body1>{t('login.description')}</Body1>
            {detailText ? (
              <div className="flex max-w-xl flex-col items-center gap-1 text-center">
                <Caption1>{t('login.redirectError', { detail: detailText })}</Caption1>
              </div>
            ) : null}
            <Button appearance="primary" onClick={login}>
              {t('login.button')}
            </Button>
          </>
        ) : (
          <Body1>{t('login.unconfigured')}</Body1>
        )}
      </div>
      <footer className="px-4 pb-6">
        <Copyright />
      </footer>
    </div>
  );
}
