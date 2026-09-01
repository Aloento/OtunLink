import { useIsAuthenticated } from '@azure/msal-react';
import { Body1, Button, Title3 } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

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
    setReturnTo(window.location.pathname + window.location.search + window.location.hash);
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
  if (loading) return <FullPageSpinner />;
  if (!me) {
    // 会话仍在（authenticated=true）但 /auth/me 因服务器/网络失败：展示可重试错误页，
    // 避免与 LoginPage 的「已登录即回首页」守卫互相导航导致死循环。
    if (error === 'server') return <SessionErrorPage onRetry={reload} />;
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
