import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { DashboardTodoItem } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../api/http';
import { getDashboardTodos, listNotifications } from '../api/notifications';
import { RefreshButton } from '../components/RefreshButton';
import { useLocale } from '../i18n/LocaleProvider';
import { formatDateTime } from '../i18n/format';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { StatCard } from '../ui/stat';
import { PageHeader } from '../ui/page-header';

// 工作台：先给「有多少活要干」，再给「最近发生了什么」。
// 待办数字是这一页的主角：卡片可点直达对应列表，数字用 tabular-nums 避免抖动。
export function DashboardPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const todosQuery = useQuery({
    queryKey: ['dashboard', 'todos'],
    queryFn: getDashboardTodos,
  });
  const recentNotificationsQuery = useQuery({
    queryKey: ['notifications', 'dashboard'],
    queryFn: () => listNotifications({ page: 1, size: 6 }),
  });

  const todos = todosQuery.data?.items ?? [];
  const recentNotifications = recentNotificationsQuery.data?.items ?? [];
  const isLoading = todosQuery.isLoading || recentNotificationsQuery.isLoading;
  const failed = todosQuery.error ?? recentNotificationsQuery.error;
  const isError = todosQuery.isError || recentNotificationsQuery.isError;
  // 「发生未知错误」对用户没有任何信息量：能拿到 API 错误码就翻成可读文案，
  // 同时给一个重试入口，不用刷新整页。
  const errorText = failed
    ? isApiError(failed)
      ? t(errorI18nKey(failed.code))
      : t('errors.UNKNOWN')
    : t('errors.UNKNOWN');
  const retry = () => {
    void todosQuery.refetch();
    void recentNotificationsQuery.refetch();
  };

  const pending = todos.reduce((sum, todo) => sum + todo.count, 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <RefreshButton
            queryKey={['dashboard', 'todos']}
            additionalKeys={[['notifications', 'dashboard']]}
          />
        }
      />

      {isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-600"
        >
          <span>{errorText}</span>
          <Button size="sm" variant="secondary" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="dashboard-todos" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="dashboard-todos" className="text-[13px] font-semibold text-ink">
            {t('dashboard.overview')}
          </h2>
          {pending > 0 ? (
            <span className="text-[11px] text-ink-subtle">
              {t('dashboard.pendingTotal', { count: pending, defaultValue: '' })}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[74px] w-full" />
            ))}
          </div>
        ) : todos.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-line bg-surface px-3 py-6 text-center text-xs text-ink-muted">
            {t('dashboard.empty')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {todos.map((todo) => (
              <TodoCard key={todo.key} todo={todo} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="dashboard-activity" className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="dashboard-activity" className="text-[13px] font-semibold text-ink">
            {t('dashboard.recentNotifications')}
          </h2>
          <Link
            to="/notifications"
            className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:underline"
          >
            {t('notifications.title')}
            <ArrowRight aria-hidden className="size-3" />
          </Link>
        </div>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : recentNotifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-muted">
              {t('dashboard.noRecentNotifications')}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {recentNotifications.map((notification) => (
                <li key={notification.id} className="flex items-start gap-2 px-3 py-2">
                  <Bell aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{notification.title}</p>
                    {notification.content ? (
                      <p className="line-clamp-2 text-xs text-ink-muted">{notification.content}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">
                    {formatDateTime(notification.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function TodoCard({ todo }: { todo: DashboardTodoItem }) {
  return (
    <Link
      to={todo.link}
      className="group rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <StatCard
        label={todo.label}
        value={todo.count}
        tone={todo.count > 0 ? 'warning' : 'neutral'}
        icon={<ClipboardList aria-hidden />}
        meta={
          <span className="inline-flex items-center gap-1 text-brand-700 opacity-0 transition-opacity group-hover:opacity-100">
            去处理
            <ArrowRight aria-hidden className="size-3" />
          </span>
        }
      />
    </Link>
  );
}
