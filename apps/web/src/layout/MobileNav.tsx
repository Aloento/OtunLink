import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { cn } from '../lib/cn';
import { NAV_ICONS } from '../routes/nav-icons';
import { ROUTES, type RouteKey } from '../routes/routes';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

// 手机底部导航。
//
// 之前是把全部路由（最多 14 个）塞进一条横向滚动的条里，第 7 个往后就永远看不到 ——
// 横向滚动这种交互没有视觉提示，用户不会去试。现在固定 4 个最常用的 + 「更多」，
// 「更多」用模态列全量（按业务/管理分组），保证每个功能都在两次点击内可达。
const PRIMARY_LIMIT = 4;

function NavItem({ routeKey, onNavigate }: { routeKey: RouteKey; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={ROUTES[routeKey].path}
      end={ROUTES[routeKey].path === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] px-1 py-1 text-[10px] leading-tight',
          isActive ? 'text-brand-700' : 'text-ink-subtle',
        )
      }
    >
      {/* aria-current 由 NavLink 自己给出，这里只做视觉上的强调 */}
      {NAV_ICONS[routeKey]}
      <span className="w-full truncate text-center">{t(`nav.${ROUTES[routeKey].navKey}`)}</span>
    </NavLink>
  );
}

function NavGroup({
  title,
  keys,
  onNavigate,
}: {
  title: string;
  keys: RouteKey[];
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{title}</p>
      <ul role="list" className="flex flex-col">
        {keys.map((key) => (
          <li key={key}>
            <NavLink
              to={ROUTES[key].path}
              end={ROUTES[key].path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[13px]',
                  isActive
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-ink-soft hover:bg-surface-muted hover:text-ink',
                )
              }
            >
              {NAV_ICONS[key]}
              <span className="min-w-0 flex-1 truncate">{t(`nav.${ROUTES[key].navKey}`)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MobileNav({ main, admin }: { main: RouteKey[]; admin: RouteKey[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // 「更多」只在确实还有放不下的项目时出现：角色只有 3 个入口时不该多一个空入口。
  const primary = main.slice(0, PRIMARY_LIMIT);
  const hasOverflow = main.length + admin.length > primary.length;

  return (
    <>
      <nav
        aria-label={t('common.mainNav')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul role="list" className="flex items-stretch gap-0.5 px-1 py-1">
          {primary.map((key) => (
            <li key={key} className="min-w-0 flex-1">
              <NavItem routeKey={key} />
            </li>
          ))}
          {hasOverflow ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] px-1 py-1 text-[10px] leading-tight text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
              >
                <Menu aria-hidden className="size-4" />
                <span className="w-full truncate text-center">{t('common.more')}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      <Dialog open={open} onOpenChange={setOpen} closeLabel={t('common.close')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.allFeatures')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-3">
            <NavGroup title={t('nav.sectionMain')} keys={main} onNavigate={() => setOpen(false)} />
            <NavGroup title={t('nav.sectionAdmin')} keys={admin} onNavigate={() => setOpen(false)} />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
