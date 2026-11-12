import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Languages,
  LogOut,
  Package,
  PanelLeft,
  Rows3,
  Search,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import type { AppLocale } from '@otunlink/shared';

import { listItems } from '../api/items';
import { getUnreadCount } from '../api/notifications';
import { useLogout, useSession } from '../auth/SessionProvider';
import { Copyright } from '../components/Copyright';
import { useLocale } from '../i18n/LocaleProvider';
import { cn } from '../lib/cn';
import { useHotkeys } from '../lib/useHotkeys';
import { MobileNav } from './MobileNav';
import { MOBILE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import { usePersistentState } from '../lib/usePersistentState';
import { canAccessPermissions } from '../routes/access';
import { navKeyForPath } from '../routes/document-title';
import { NAV_ICONS } from '../routes/nav-icons';
import { NAV_ADMIN, NAV_MAIN, ROUTES, type RouteKey } from '../routes/routes';
import { Badge } from '../ui/badge';
import type { CommandAction, CommandGroup } from '../ui/command-palette';
import { Kbd } from '../ui/kbd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { AppToaster } from '../ui/toast';

// 命令面板只在用户按 ⌘K 时才需要：懒加载把 cmdk 从首屏包里摘出去。
const CommandPalette = lazy(() =>
  import('../ui/command-palette').then((module) => ({ default: module.CommandPalette })),
);

// ---------------------------------------------------------------------------
// 应用外壳：桌面左侧固定导航（可收成图标栏）+ 顶部工具条 + 内容区。
// ERP 的使用者一天要在十几个列表页之间跳，导航必须在第一屏、且位置永不变：
// 侧栏不随滚动离开视口，内容区自己滚。
// ---------------------------------------------------------------------------

function permittedRoutes(role: Parameters<typeof canAccessPermissions>[0]): {
  main: RouteKey[];
  admin: RouteKey[];
} {
  return {
    main: NAV_MAIN.filter((key) => canAccessPermissions(role, ROUTES[key].permissions)),
    admin: NAV_ADMIN.filter((key) => canAccessPermissions(role, ROUTES[key].permissions)),
  };
}

function NavItem({ routeKey, collapsed }: { routeKey: RouteKey; collapsed: boolean }) {
  const { t } = useTranslation();
  const route = ROUTES[routeKey];

  return (
    <NavLink
      to={route.path}
      end={route.path === '/'}
      // 收成图标栏时用 title 作为鼠标提示；读屏仍然读文字标签
      title={collapsed ? t(`nav.${route.navKey}`) : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2 rounded-[var(--radius-control)] py-1.5 text-[13px] transition-colors',
          collapsed ? 'justify-center px-0' : 'px-2',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
          isActive
            ? 'bg-brand-50 font-medium text-brand-700'
            : 'text-ink-soft hover:bg-surface-hover hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* 选中态除了底色，再给一条 2px 的左侧色条：只靠浅底色在低质量屏幕上几乎看不出 */}
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-1 start-0 w-0.5 rounded-full bg-brand-600 transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span className={cn('shrink-0', isActive ? 'text-brand-600' : 'text-ink-subtle')}>
            {NAV_ICONS[routeKey]}
          </span>
          {collapsed ? <span className="sr-only">{t(`nav.${route.navKey}`)}</span> : <span className="truncate">{t(`nav.${route.navKey}`)}</span>}
        </>
      )}
    </NavLink>
  );
}

type Density = 'compact' | 'cozy' | 'comfortable';

function useDensity(): [Density, (next: Density) => void] {
  const [density, setDensity] = usePersistentState<Density>('ui:density', 'cozy');

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  return [density, setDensity];
}

function AccountMenu({ name, roleLabel, density, onDensity }: { name?: string; roleLabel: string; density: Density; onDensity: (next: Density) => void }) {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const logout = useLogout();
  const next: AppLocale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  const languageLabel = locale === 'zh-CN' ? 'EN' : '中文';
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={name ? `${t('common.accountMenu')} ${name}` : t('common.accountMenu')}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-0.5 pe-2 ps-0.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white"
        >
          {initial}
        </span>
        <span className="hidden max-w-28 truncate sm:inline">{name ?? t('common.notAssigned')}</span>
        <ChevronDown aria-hidden className="size-3.5 text-ink-subtle" />
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('common.density')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onDensity('compact')}>
          <Rows3 aria-hidden className="size-4 text-ink-subtle" />
          {t('common.densityCompact')}
          {density === 'compact' ? <span className="ms-auto text-brand-600">•</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDensity('cozy')}>
          <Rows3 aria-hidden className="size-4 text-ink-subtle" />
          {t('common.densityCozy')}
          {density === 'cozy' ? <span className="ms-auto text-brand-600">•</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDensity('comfortable')}>
          <Rows3 aria-hidden className="size-4 text-ink-subtle" />
          {t('common.densityComfortable')}
          {density === 'comfortable' ? <span className="ms-auto text-brand-600">•</span> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = usePersistentState('ui:sidebar-collapsed', false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [density, setDensity] = useDensity();

  const isMobile = useMediaQuery(MOBILE_QUERY);
  // 768–1024 的平板既不适合底部导航（太挤）也不适合 224px 侧栏（吃掉三分之一宽度），
  // 固定成 56px 图标栏；桌面才允许用户自己收/展。
  const showSidebar = useMediaQuery('(min-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const rail = isTablet || collapsed;

  const nav = permittedRoutes(me?.role ?? null);
  const roleLabel = me?.role ? t(`roles.${me.role}`) : t('common.notAssigned');

  // 「当前页面叫什么是浏览器标签页和读屏的第一句信息」：详情页按最长前缀归到所属模块。
  const location = useLocation();
  const currentNavKey = navKeyForPath(location.pathname);
  const currentTitle = currentNavKey ? t(`nav.${ROUTES[currentNavKey].navKey}`) : null;

  useEffect(() => {
    document.title = currentTitle ? `${currentTitle} · ${t('app.name')}` : t('app.name');
  }, [currentTitle, t]);

  // 路由切换后把焦点移到内容起点：否则键盘/读屏用户仍停在刚点的导航项上，
  // 新页面的出现不会被播报（html 指南：新视图就位时把焦点移到内容开头）。
  const mainRef = useRef<HTMLElement | null>(null);
  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    mainRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
  });
  const unreadCount = unread.data?.count ?? 0;

  useHotkeys({ 'mod+k': () => setPaletteOpen((prev) => !prev) }, { allowInInput: true });

  const routeActions: CommandAction[] = useMemo(
    () =>
      [...nav.main, ...nav.admin].map((key) => ({
        id: `route:${key}`,
        label: t(`nav.${ROUTES[key].navKey}`),
        hint: ROUTES[key].path,
        icon: NAV_ICONS[key],
        run: () => navigate(ROUTES[key].path),
      })),
    [nav.admin, nav.main, navigate, t],
  );

  const groups: CommandGroup[] = useMemo(
    () => [
      { heading: t('common.commandPalette'), actions: routeActions },
      {
        heading: t('common.density'),
        actions: [
          {
            id: 'action:density-compact',
            label: t('common.densityCompact'),
            icon: <Rows3 aria-hidden className="size-4" />,
            run: () => setDensity('compact'),
          },
          {
            id: 'action:density-cozy',
            label: t('common.densityCozy'),
            icon: <Rows3 aria-hidden className="size-4" />,
            run: () => setDensity('cozy'),
          },
        ],
      },
    ],
    [routeActions, setDensity, t],
  );

  const searchRecords = async (query: string): Promise<CommandAction[]> => {
    const result = await listItems({ q: query, size: 6 });
    return result.items.map((item) => ({
      id: `item:${item.id}`,
      label: item.name,
      hint: item.sku ?? undefined,
      icon: <Package aria-hidden className="size-4" />,
      run: () => navigate(`/items/${item.id}`),
    }));
  };

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-3 py-2 text-sm font-medium text-ink focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50"
      >
        {t('common.skipToContent')}
      </a>

      {showSidebar ? (
        <aside
          className={cn(
            'sticky top-0 flex h-dvh shrink-0 flex-col border-e border-line bg-surface transition-[width] duration-150',
            rail ? 'w-14' : 'w-56',
          )}
        >
          <div className={cn('flex h-12 items-center gap-2 border-b border-line px-3', rail && 'justify-center px-0')}>
            <img src="/icons/logo.png" alt="" className="size-6 shrink-0" />
            {rail ? null : <span className="truncate text-[13px] font-semibold text-ink">{t('app.name')}</span>}
          </div>

          <nav aria-label={t('common.mainNav')} className="app-scroll flex-1 overflow-y-auto p-1.5">
            {nav.main.length > 0 ? (
              <p className={cn('px-2 pb-1 pt-2 text-[11px] font-semibold text-ink-subtle', rail && 'sr-only')}>
                {t('nav.sectionMain')}
              </p>
            ) : null}
            <div className="flex flex-col gap-0.5">
              {nav.main.map((key) => (
                <NavItem key={key} routeKey={key} collapsed={rail} />
              ))}
            </div>

            {nav.admin.length > 0 ? (
              <>
                <p className={cn('px-2 pb-1 pt-3 text-[11px] font-semibold text-ink-subtle', rail && 'sr-only')}>
                  {t('nav.sectionAdmin')}
                </p>
                <div className="flex flex-col gap-0.5">
                  {nav.admin.map((key) => (
                    <NavItem key={key} routeKey={key} collapsed={rail} />
                  ))}
                </div>
              </>
            ) : null}
          </nav>

          <div className={cn('flex flex-col gap-1 border-t border-line p-1.5', rail && 'items-center')}>
            <button
              type="button"
              hidden={isTablet}
              onClick={() => setCollapsed((prev) => !prev)}
              className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
              aria-label={rail ? t('common.sidebarExpand') : t('common.sidebarCollapse')}
              aria-expanded={!rail}
            >
              {rail ? <ChevronsRight aria-hidden className="size-4" /> : <ChevronsLeft aria-hidden className="size-4" />}
              {rail ? null : <span className="text-xs">{t('common.collapse')}</span>}
            </button>
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-surface px-3">
          {isMobile || isTablet ? (
            <>
              <img src="/icons/logo.png" alt="" className="size-6 shrink-0" />
              <span className="truncate text-[13px] font-semibold text-ink">{t('app.name')}</span>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? t('common.sidebarExpand') : t('common.sidebarCollapse')}
              className="inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
            >
              <PanelLeft aria-hidden className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'flex h-8 min-w-0 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-muted/60 px-2 text-[13px] text-ink-subtle',
              'hover:border-line-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
              'sm:max-w-96 sm:flex-1',
            )}
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="hidden truncate sm:inline">{t('common.globalSearch')}</span>
            <span className="ms-auto hidden items-center gap-0.5 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="flex-1 sm:hidden" />

          <NavLink
            to={ROUTES.notifications.path}
            className="relative inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-soft hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            aria-label={
              unreadCount > 0 ? `${t('notifications.title')} (${unreadCount})` : t('notifications.title')
            }
          >
            <Bell aria-hidden className="size-4" />
            {unreadCount > 0 ? (
              <Badge
                tone="danger"
                className="absolute -end-0.5 -top-0.5 min-h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            ) : null}
          </NavLink>

          <AccountMenu name={me?.name} roleLabel={roleLabel} density={density} onDensity={setDensity} />
        </header>

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 px-3 pb-20 pt-3 outline-none md:px-4 md:pb-4"
        >
          <Outlet />
        </main>

        {isMobile ? null : (
          <footer className="px-4 pb-3">
            <Copyright />
          </footer>
        )}
      </div>

      {isMobile ? <MobileNav main={nav.main} admin={nav.admin} /> : null}


      {paletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette
            open
            onOpenChange={setPaletteOpen}
            groups={groups}
            onQueryRecords={searchRecords}
            recordsHeading={t('nav.items')}
          />
        </Suspense>
      ) : null}
      <AppToaster />
    </div>
  );
}
