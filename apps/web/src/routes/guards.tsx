import { useIsAuthenticated } from '@azure/msal-react';
import { Body1, Button, Caption1, Title3 } from '@fluentui/react-components';
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
    // 仅在当前不在 /login 时记录：`<Navigate replace>` 后组件会重渲染，此时 location
    // 已是 /login，若再写一次会把深链覆盖成 /login，导致登录后回不到原页。
    if (window.location.pathname !== LOGIN_PATH) {
      setReturnTo(window.location.pathname + window.location.search + window.location.hash);
    }
    return <Navigate to={LOGIN_PATH} replace />;
  }
  return <>{children}</>;
}

interface SessionErrorProps {
  title: string;
  body: string;
  detail: string | null;
  actionLabel: string;
  onAction: () => void;
}

function SessionErrorPage({ title, body, detail, actionLabel, onAction }: SessionErrorProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      <Title3>{title}</Title3>
      <Body1 className="text-center">{body}</Body1>
      {/* 诊断信息：以前两种完全不同的故障共用一句「服务器或网络异常」，导致无法区分
          「授权过期」与「接口 5xx」。这里把错误码/HTTP 状态直接摊开，便于自助排查。 */}
      {detail ? (
        <div className="flex max-w-xl flex-col items-center gap-1 text-center">
          <Caption1>{t('session.detailLabel')}</Caption1>
          <code className="break-all rounded bg-neutral-100 px-2 py-1 text-xs">{detail}</code>
        </div>
      ) : null}
      <Button appearance="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

export function RequireActive({ children }: { children: ReactNode }) {
  const { me, loading, error, errorDetail, reload, signInAgain } = useSession();
  const { t } = useTranslation();

  if (loading) return <FullPageSpinner />;
  if (!me) {
    // 服务器/网络异常：允许重试，避免把可恢复的错误误判为会话失效。
    if (error === 'server') {
      return (
        <SessionErrorPage
          title={t('session.serverErrorTitle')}
          body={t('session.serverErrorBody')}
          detail={errorDetail}
          actionLabel={t('session.retry')}
          onAction={() => void reload()}
        />
      );
    }
    // 授权类失败（令牌刷新被拒、需要重新同意、账号被撤销）：重试静默刷新没有意义，
    // 直接引导重新登录；旧实现的按钮只是跳转 /login，点了也不会恢复。
    if (error === 'auth') {
      return (
        <SessionErrorPage
          title={t('session.authErrorTitle')}
          body={t('session.authErrorBody')}
          detail={errorDetail}
          actionLabel={t('session.signInAgain')}
          onAction={signInAgain}
        />
      );
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
