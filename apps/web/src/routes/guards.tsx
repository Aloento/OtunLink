import { useIsAuthenticated } from '@azure/msal-react';
import { Body1, Button, Title3 } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import type { Permission } from '@otunlink/shared';

import { setReturnTo } from '../auth/returnTo';
import { useSession } from '../auth/SessionProvider';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { ForbiddenPage } from '../components/ForbiddenPage';
import { PendingPage } from '../pages/PendingPage';
import { canAccessPermissions } from './access';
import { LOGIN_PATH } from './routes';

// 路由守卫：
// RequireAuth：未登录 → /login。
// RequireActive：已登录但非 ACTIVE（PENDING/DISABLED）→ 引导页。
// RequirePermission：ACTIVE 但岗位能力不满足 → 403 占位页。

export function RequireAuth({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  if (!authenticated) {
    // 记录原目标路径，登录会话就绪后由 LoginPage / CallbackPage 恢复（defect #9）。
    // 仅在当前不在 /login 时记录：`<Navigate replace>` 后组件会重渲染，此时 location
    // 已是 /login，若再写一次会把深链覆盖成 /login，导致登录后回不到原页。
    if (window.location.pathname !== LOGIN_PATH) {
      setReturnTo(window.location.pathname + window.location.search + window.location.hash);
    }
    return <Navigate to={LOGIN_PATH} replace />;
  }
  return <>{children}</>;
}

function SessionErrorPage({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Title3>{t('session.errorTitle')}</Title3>
      <Body1>{t('session.errorBody')}</Body1>
      <Button appearance="primary" onClick={onRetry}>
        {t('session.retry')}
      </Button>
    </div>
  );
}

export function RequireActive({ children }: { children: ReactNode }) {
  const { me, loading, error, reload } = useSession();
  const navigate = useNavigate();

  if (loading) return <FullPageSpinner />;
  if (!me) {
    // 服务器/网络异常：允许重试，避免把可恢复的错误误判为会话失效。
    if (error === 'server') return <SessionErrorPage onRetry={() => void reload()} />;
    // 资源 scope / consent 问题会让 acquireTokenSilent 失败；保留 MSAL account，
    // 引导用户重新走登录流程而不是直接清缓存并循环回到 /login。
    if (error === 'token') {
      return <SessionErrorPage onRetry={() => navigate(LOGIN_PATH, { replace: true })} />;
    }
    // 已登录但 /auth/me 返回空（如令牌失效被清缓存）：记录原目标路径，登录后回跳原页。
    // 与 RequireAuth 相同，避免 `<Navigate replace>` 重渲染后把深链覆盖成 /login。
    if (window.location.pathname !== LOGIN_PATH) {
      setReturnTo(window.location.pathname + window.location.search + window.location.hash);
    }
    return <Navigate to={LOGIN_PATH} replace />;
  }
  if (me.status !== 'ACTIVE') return <PendingPage me={me} onRefresh={reload} />;
  return <>{children}</>;
}

export function RequirePermission({
  permissions,
  children,
}: {
  permissions: readonly Permission[];
  children: ReactNode;
}) {
  const { me } = useSession();
  if (!me) return <FullPageSpinner />;
  if (!canAccessPermissions(me.role, permissions)) return <ForbiddenPage />;
  return <>{children}</>;
}
