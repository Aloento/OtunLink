import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, Languages, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

import type { AppLocale } from '@otunlink/shared';

import { getUnreadCount } from '../api/notifications';
import { useLogout, useSession } from '../auth/SessionProvider';
import { Copyright } from '../components/Copyright';
import { useLocale } from '../i18n/LocaleProvider';
import { canAccessPermissions } from '../routes/access';
import { NAV_ADMIN, NAV_MAIN, ROUTES, type RouteKey } from '../routes/routes';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
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

const navLinkBase =
  'flex items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ' +
  'text-ink-soft hover:bg-surface-muted hover:text-ink ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

function NavItems({ keys, vertical }: { keys: RouteKey[]; vertical?: boolean }) {
  const { t } = useTranslation();

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
              `${navLinkBase} ${vertical ? '' : 'shrink-0'} ${
                isActive ? 'bg-brand-50 font-semibold text-brand-700 hover:bg-brand-50' : ''
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

function AccountMenu({ name, roleLabel }: { name?: string; roleLabel: string }) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const logout = useLogout();

  const next: AppLocale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  const languageLabel = locale === 'zh-CN' ? 'EN' : '中文';
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // 可访问名称必须包含按钮上的可见文字（用户名），否则语音控制说不出这个名字。
        aria-label={name ? `${t('common.accountMenu')} ${name}` : t('common.accountMenu')}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pe-2 ps-1 text-sm text-ink-soft transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
        >
          {initial}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{name ?? t('common.notAssigned')}</span>
        <ChevronDown aria-hidden className="size-4 text-ink-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block truncate text-ink">{name}</span>
          <span className="block truncate font-normal">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setLocale(next)}>
          <Languages aria-hidden className="size-4 text-ink-subtle" />
          {t('common.switchLanguage')}
          <span className="ms-auto text-xs text-ink-subtle">{languageLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout()}>
          <LogOut aria-hidden className="size-4 text-ink-subtle" />
          {t('common.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { me } = useSession();

  const isDesktop = useMediaQuery('(min-width: 1025px)');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = !isDesktop && !isMobile;

  const navKeys = permittedRoutes(me?.role ?? null);
  const roleLabel = me?.role ? t(`roles.${me.role}`) : t('common.notAssigned');

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
  });
  const unreadCount = unread.data?.count ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-3 py-2 text-sm font-medium text-ink focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50"
      >
        {t('common.skipToContent')}
      </a>

      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-4">
          <img src="/icons/logo.png" alt="" className="size-7 shrink-0" />
          <span className="truncate text-base font-semibold text-ink">{t('app.name')}</span>
          <div className="flex-1" />

          <NavLink
            to={ROUTES.notifications.path}
            className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            aria-label={
              unreadCount > 0
                ? `${t('notifications.title')} (${unreadCount})`
                : t('notifications.title')
            }
          >
            <Bell aria-hidden className="size-5" />
            {unreadCount > 0 ? (
              <Badge
                tone="danger"
                // 计数徽标是文字内容：用 min-h 而不是固定高度，系统字号放大时才不会被裁切
                className="absolute -end-1 -top-1 min-h-4 min-w-4 justify-center px-1 text-xs leading-none"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            ) : null}
          </NavLink>

          <AccountMenu name={me?.name} roleLabel={roleLabel} />
        </div>
      </header>

      {isTablet ? (
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2">
          <NavItems keys={navKeys} />
        </nav>
      ) : null}

      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        {isDesktop ? (
          <aside className="w-60 shrink-0 border-e border-line bg-surface">
            <nav className="sticky top-14 flex flex-col gap-1 p-3">
              <NavItems keys={navKeys} vertical />
            </nav>
          </aside>
        ) : null}
        <main
          id="main"
          // 跳过导航的落点需要可编程聚焦：屏幕放大镜不会替非可聚焦元素滚动视口。
          tabIndex={-1}
          className="min-w-0 flex-1 p-4 pb-24 md:p-6 md:pb-8"
        >
          <Outlet />
        </main>
      </div>

      <footer className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-2 md:pb-4">
        <Copyright />
      </footer>

      {isMobile ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-line bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <NavItems keys={navKeys} />
        </nav>
      ) : null}
    </div>
  );
}
