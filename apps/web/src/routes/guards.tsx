import { useIsAuthenticated } from '@azure/msal-react';
import { Spinner } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';

import type { Permission } from '@otunlink/shared';

import { ForbiddenPage } from '../components/ForbiddenPage';
import { PendingPage } from '../pages/PendingPage';
import { useSession } from '../auth/SessionProvider';
import { canAccessPermissions } from './access';
import { LOGIN_PATH } from './routes';

// 路由守卫（ck-03）：
// RequireAuth：未登录 → /login。
// RequireActive：已登录但非 ACTIVE（PENDING/DISABLED）→ 引导页。
// RequirePermission：ACTIVE 但岗位能力不满足 → 403 占位页。

function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label={t('common.loading')} />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  if (!authenticated) {
    return <Navigate to={LOGIN_PATH} replace />;
  }
  return <>{children}</>;
}

export function RequireActive({ children }: { children: ReactNode }) {
  const { me, loading, reload } = useSession();
  if (loading) return <FullPageSpinner />;
  if (!me) return <Navigate to={LOGIN_PATH} replace />;
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
