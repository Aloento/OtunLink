import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { NotificationDto } from '@otunlink/shared';

import { listNotifications, markNotificationsRead } from '../api/notifications';
import { refreshAfterWrite } from '../api/queryClient';
import { RefreshButton } from '../components/RefreshButton';
import { useSession } from '../auth/SessionProvider';
import { useLocale } from '../i18n/LocaleProvider';
import { formatDateTime } from '../i18n/format';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
import { Pagination } from '../ui/pagination';
import { Spinner } from '../ui/spinner';

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
  });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    onSuccess: () => {
      void refreshAfterWrite(queryClient);
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
      <PageHeader
        title={t('notifications.title')}
        description={
          <span className="text-xs text-ink-subtle">
            {me ? `${me.name} · ${t(`roles.${me.role ?? ''}`)}` : ''}
          </span>
        }
        actions={
          <>
            <RefreshButton
              queryKey={['notifications', 'list']}
              additionalKeys={[['notifications', 'unread-count'], ['notifications', 'dashboard']]}
            />
            <Button
              size="sm"
              variant={filter === 'all' ? 'primary' : 'secondary'}
              aria-pressed={filter === 'all'}
              onClick={() => {
                setFilter('all');
                setPage(1);
              }}
            >
              {t('notifications.all')}
            </Button>
            <Button
              size="sm"
              variant={filter === 'unread' ? 'primary' : 'secondary'}
              aria-pressed={filter === 'unread'}
              onClick={() => {
                setFilter('unread');
                setPage(1);
              }}
            >
              {t('notifications.unread')}
            </Button>
            <Button
              size="sm"
              variant="subtle"
              disabled={markRead.isPending || items.every((n) => n.readAt !== null)}
              onClick={markAllRead}
            >
              {t('notifications.markAllRead')}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          {unreadOnly ? t('notifications.noUnread') : t('notifications.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <NotificationItem key={n.id} item={n} onRead={markRead.mutate} busy={markRead.isPending} />
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          totalLabel={t('notifications.total', { total })}
        />
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
    <li className="flex items-start gap-3 rounded-card border border-line bg-surface p-3">
      {unread && <Badge tone="danger">{t('notifications.unread')}</Badge>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={unread ? 'font-semibold text-ink' : 'font-medium text-ink-muted'}>
            {item.title}
          </span>
          <span className="text-xs text-ink-subtle">{formatDateTime(item.createdAt, locale)}</span>
        </div>
        {item.content && <p className="mt-1 text-xs text-ink-muted">{item.content}</p>}
        {item.link && (
          <Link
            to={item.link}
            aria-label={`${t('notifications.viewDetail')} · ${item.title}`}
            className="mt-1 inline-block text-sm text-brand-700 hover:underline"
          >
            {t('notifications.viewDetail')}
          </Link>
        )}
      </div>
      {unread && (
        <Button size="sm" variant="subtle" disabled={busy} onClick={() => onRead([item.id])}>
          {t('notifications.markRead')}
        </Button>
      )}
    </li>
  );
}
