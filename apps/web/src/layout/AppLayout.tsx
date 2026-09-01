import { useMsal } from '@azure/msal-react';
import { Badge, Button } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { getUnreadCount } from '../api/notifications';
import { useSession } from '../auth/SessionProvider';
import { Copyright } from '../components/Copyright';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { canAccessPermissions } from '../routes/access';
import { NAV_ADMIN, NAV_MAIN, ROUTES, type RouteKey } from '../routes/routes';
import { useMediaQuery } from './useMediaQuery';

// 响应式布局：
// 桌面（>1024）：左侧边栏导航
// 平板（768–1024）：顶部横向导航
// 手机（<768）：底部导航
// 导航项按当前岗位权限过滤。

function permittedRoutes(role: Parameters<typeof canAccessPermissions>[0]): RouteKey[] {
  const main = NAV_MAIN.filter((key) => canAccessPermissions(role, ROUTES[key].permissions));
  const admin = NAV_ADMIN.filter((key) => canAccessPermissions(role, ROUTES[key].permissions));
  return [...main, ...admin];
}

function NavItems({ keys, vertical }: { keys: RouteKey[]; vertical?: boolean }) {
  const { t } = useTranslation();
  const linkBase = 'whitespace-nowrap rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100';

  return (
    <>
      {keys.map((key) => {
        const route = ROUTES[key];
        return (
          <NavLink
            key={route.path}
            to={route.path}
            end={route.path === '/'}
            className={({ isActive }) =>
              `${linkBase} ${vertical ? 'block' : 'inline-block'} ${
                isActive ? 'bg-blue-50 font-semibold text-blue-700' : ''
              }`
            }
          >
            {t(`nav.${route.navKey}`)}
          </NavLink>
        );
      })}
    </>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { me } = useSession();
  const { instance } = useMsal();

  const isDesktop = useMediaQuery('(min-width: 1025px)');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = !isDesktop && !isMobile;

  const navKeys = permittedRoutes(me?.role ?? null);
  const roleLabel = me?.role ? t(`roles.${me.role}`) : t('common.notAssigned');
  const logout = () => instance.logoutRedirect();

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4">
        <img src="/icons/logo.png" alt="" className="h-7 w-7 shrink-0" />
        <span className="text-base font-semibold text-neutral-900">{t('app.name')}</span>
        <div className="flex-1" />
        <span className="hidden text-sm text-neutral-500 sm:inline">
          {me?.name} · {roleLabel}
        </span>
        <NavLink to={ROUTES.notifications.path} className="relative inline-flex items-center" aria-label={t('notifications.title')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {Boolean(unread.data?.count) && (
            <Badge
              appearance="filled"
              color="danger"
              size="tiny"
              className="absolute -right-1.5 -top-1.5"
            >
              {unread.data!.count! > 99 ? '99+' : unread.data!.count!}
            </Badge>
          )}
        </NavLink>
        <LanguageSwitch />
        <Button size="small" appearance="subtle" onClick={logout}>
          {t('common.logout')}
        </Button>
      </header>

      {isTablet && (
        <nav className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2">
          <NavItems keys={navKeys} />
        </nav>
      )}

      <div className="flex flex-1">
        {isDesktop && (
          <aside className="w-60 shrink-0 border-r border-neutral-200 bg-white">
            <nav className="flex flex-col gap-1 p-3">
              <NavItems keys={navKeys} vertical />
            </nav>
          </aside>
        )}
        <main className="min-w-0 flex-1 p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      <footer className="px-4 pb-20 pt-2 md:pb-4">
        <Copyright />
      </footer>

      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-neutral-200 bg-white px-3 py-2">
          <NavItems keys={navKeys} />
        </nav>
      )}
    </div>
  );
}
