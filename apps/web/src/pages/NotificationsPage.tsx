import { Badge, Button, Spinner, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { NotificationDto } from '@otunlink/shared';

import { listNotifications, markNotificationsRead } from '../api/notifications';
import { RefreshButton } from '../components/RefreshButton';
import { useSession } from '../auth/SessionProvider';
import { useLocale } from '../i18n/LocaleProvider';
import { formatDateTime } from '../i18n/format';

const PAGE_SIZE = 20;

// 通知中心：本人 + 所属 scope 的通知列表，支持未读筛选与批量已读。
export function NotificationsPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);

  const unreadOnly = filter === 'unread';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', 'list', unreadOnly, page],
    queryFn: () => listNotifications({ unreadOnly, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const markAllRead = () => {
    const unreadIds = (data?.items ?? []).filter((n) => n.readAt === null).map((n) => n.id);
    if (unreadIds.length > 0) markRead.mutate(unreadIds);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Title1 as="h1">{t('notifications.title')}</Title1>
          <Text size={200} className="text-neutral-500">
            {me ? `${me.name} · ${t(`roles.${me.role ?? ''}`)}` : ''}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton
            queryKey={['notifications', 'list']}
            additionalKeys={[['notifications', 'unread-count'], ['notifications', 'dashboard']]}
          />
          <Button
            size="small"
            appearance={filter === 'all' ? 'primary' : 'secondary'}
            onClick={() => {
              setFilter('all');
              setPage(1);
            }}
          >
            {t('notifications.all')}
          </Button>
          <Button
            size="small"
            appearance={filter === 'unread' ? 'primary' : 'secondary'}
            onClick={() => {
              setFilter('unread');
              setPage(1);
            }}
          >
            {t('notifications.unread')}
          </Button>
          <Button
            size="small"
            appearance="subtle"
            disabled={markRead.isPending || items.every((n) => n.readAt !== null)}
            onClick={markAllRead}
          >
            {t('notifications.markAllRead')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : items.length === 0 ? (
        <Text className="text-neutral-500">
          {unreadOnly ? t('notifications.noUnread') : t('notifications.empty')}
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <NotificationItem key={n.id} item={n} onRead={markRead.mutate} busy={markRead.isPending} />
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>{t('notifications.total', { total })}</span>
          <div className="flex items-center gap-2">
            <Button
              size="small"
              appearance="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ←
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              size="small"
              appearance="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  item,
  onRead,
  busy,
}: {
  item: NotificationDto;
  onRead: (ids: string[]) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const unread = item.readAt === null;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      {unread && <Badge appearance="filled" color="brand" size="tiny" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={unread ? 'font-semibold' : 'font-medium text-neutral-600'}>
            {item.title}
          </span>
          <span className="text-xs text-neutral-400">{formatDateTime(item.createdAt, locale)}</span>
        </div>
        {item.content && (
          <Text size={200} className="mt-1 block text-neutral-600">
            {item.content}
          </Text>
        )}
        {item.link && (
          <Link to={item.link} className="mt-1 inline-block text-sm text-blue-600 hover:underline">
            {t('notifications.viewDetail')}
          </Link>
        )}
      </div>
      {unread && (
        <Button size="small" appearance="subtle" disabled={busy} onClick={() => onRead([item.id])}>
          {t('notifications.markRead')}
        </Button>
      )}
    </li>
  );
}

