import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { DashboardTodoItem } from '@otunlink/shared';

import { getDashboardTodos, listNotifications } from '../api/notifications';
import { RefreshButton } from '../components/RefreshButton';
import { useLocale } from '../i18n/LocaleProvider';
import { formatDateTime } from '../i18n/format';
import { Card, CardHeader } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { Spinner } from '../ui/spinner';

// 工作台：按角色 + scope 聚合待办（GET /dashboard/todos），并展示最近通知。
export function DashboardPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const todosQuery = useQuery({
    queryKey: ['dashboard', 'todos'],
    queryFn: getDashboardTodos,
  });
  const recentNotificationsQuery = useQuery({
    queryKey: ['notifications', 'dashboard'],
    queryFn: () => listNotifications({ page: 1, size: 5 }),
  });

  const items = todosQuery.data?.items ?? [];
  const recentNotifications = recentNotificationsQuery.data?.items ?? [];

  const isLoading = todosQuery.isLoading || recentNotificationsQuery.isLoading;
  const isError = todosQuery.isError || recentNotificationsQuery.isError;

  return (
    <div className="flex flex-col gap-6">
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

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      ) : (
        <>
          <Card>
            <CardHeader title={t('dashboard.overview')} />
            {items.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t('dashboard.empty')}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((todo) => (
                  <TodoCard key={todo.key} todo={todo} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t('dashboard.recentNotifications')}
              actions={
                <Link to="/notifications" className="text-sm text-brand-700 hover:underline">
                  {t('notifications.title')}
                </Link>
              }
            />
            {recentNotifications.length === 0 ? (
              <p className="text-sm text-ink-subtle">{t('dashboard.noRecentNotifications')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentNotifications.map((notification) => (
                  <li
                    key={notification.id}
                    className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">{notification.title}</div>
                      {notification.content && (
                        <div className="text-sm text-ink-muted">{notification.content}</div>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-ink-subtle">
                      {formatDateTime(notification.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function TodoCard({ todo }: { todo: DashboardTodoItem }) {
  return (
    <li className="rounded-lg border border-line bg-surface-muted p-4">
      <Link to={todo.link} className="flex flex-col gap-2 hover:underline">
        <span className="text-sm text-ink-muted">{todo.label}</span>
        <span className="text-2xl font-semibold tabular-nums text-ink">{todo.count}</span>
      </Link>
    </li>
  );
}
