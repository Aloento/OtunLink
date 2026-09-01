import { Body1, Spinner, Text, Title1 } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { DashboardTodoItem } from '@otunlink/shared';

import { getDashboardTodos, listNotifications } from '../api/notifications';
import { useLocale } from '../i18n/LocaleProvider';
import { formatDateTime } from '../i18n/format';

// 工作台：按角色 + scope 聚合待办（GET /dashboard/todos），并展示最近通知。
export function DashboardPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const todosQuery = useQuery({
    queryKey: ['dashboard', 'todos'],
    queryFn: getDashboardTodos,
    staleTime: 30_000,
  });
  const recentNotificationsQuery = useQuery({
    queryKey: ['notifications', 'dashboard'],
    queryFn: () => listNotifications({ page: 1, size: 5 }),
    staleTime: 30_000,
  });

  const items = todosQuery.data?.items ?? [];
  const recentNotifications = recentNotificationsQuery.data?.items ?? [];

  const isLoading = todosQuery.isLoading || recentNotificationsQuery.isLoading;
  const isError = todosQuery.isError || recentNotificationsQuery.isError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Title1 as="h1">{t('dashboard.title')}</Title1>
        <Body1>{t('dashboard.description')}</Body1>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-3 text-lg font-semibold text-neutral-900">{t('dashboard.overview')}</div>
            {items.length === 0 ? (
              <Text className="text-neutral-500">{t('dashboard.empty')}</Text>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((todo) => (
                  <TodoCard key={todo.key} todo={todo} />
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Text as="h2" weight="semibold" size={400}>
                {t('dashboard.recentNotifications')}
              </Text>
              <Link to="/notifications" className="text-sm text-blue-600 hover:underline">
                {t('notifications.title')}
              </Link>
            </div>
            {recentNotifications.length === 0 ? (
              <Text className="text-neutral-500">{t('dashboard.noRecentNotifications')}</Text>
            ) : (
              <ul className="flex flex-col gap-2">
                {recentNotifications.map((notification) => (
                  <li key={notification.id} className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-2 last:border-b-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900">{notification.title}</div>
                      {notification.content && <div className="text-sm text-neutral-600">{notification.content}</div>}
                    </div>
                    <span className="shrink-0 text-xs text-neutral-500">{formatDateTime(notification.createdAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TodoCard({ todo }: { todo: DashboardTodoItem }) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <Link to={todo.link} className="flex flex-col gap-2 hover:underline">
        <span className="text-sm text-neutral-600">{todo.label}</span>
        <span className="text-2xl font-semibold text-neutral-900">{todo.count}</span>
      </Link>
    </li>
  );
}
