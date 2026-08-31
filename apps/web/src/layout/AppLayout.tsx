import { useMsal } from '@azure/msal-react';
import { Button } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import { useSession } from '../auth/SessionProvider';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { canAccessPermissions } from '../routes/access';
import { NAV_ADMIN, NAV_MAIN, ROUTES, type RouteKey } from '../routes/routes';
import { useMediaQuery } from './useMediaQuery';

// 响应式布局（design.md §6.1）：
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

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4">
        <span className="text-base font-semibold text-neutral-900">{t('app.name')}</span>
        <div className="flex-1" />
        <span className="hidden text-sm text-neutral-500 sm:inline">
          {me?.name} · {roleLabel}
        </span>
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

      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-neutral-200 bg-white px-3 py-2">
          <NavItems keys={navKeys} />
        </nav>
      )}
    </div>
  );
}
