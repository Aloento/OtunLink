import { Body1, Spinner, Text, Title1 } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Permissions, hasPermission, type ReturnOrderDto, type ShipmentDto } from '@otunlink/shared';

import { listReturns } from '../api/returns';
import { listShipments } from '../api/shipments';
import { useSession } from '../auth/SessionProvider';

// 工作台（ck-06 §6.1）：集货侧「待处理差异」+ 仓库侧「待点货」。
export function DashboardPage() {
  const { t } = useTranslation();
  const { me } = useSession();

  const canApproveReview = hasPermission(me?.role, Permissions.REVIEWS_APPROVE);
  const canCount = hasPermission(me?.role, Permissions.COUNTING_WRITE);
  const canHandleReturns = hasPermission(me?.role, Permissions.SHIPMENT_RETURNS_HANDLE);

  const pendingReviews = useQuery({
    queryKey: ['shipments', 'list', { status: 'REVIEW_PENDING' }],
    queryFn: () => listShipments({ status: 'REVIEW_PENDING', size: 20 }),
    enabled: canApproveReview,
    staleTime: 30_000,
  });

  const pendingCount = useQuery({
    queryKey: ['shipments', 'list', { status: 'SENT' }],
    queryFn: () => listShipments({ status: 'SENT', size: 20 }),
    enabled: canCount,
    staleTime: 30_000,
  });

  const pendingReturns = useQuery({
    queryKey: ['return-orders', 'list', { status: 'PENDING' }],
    queryFn: () => listReturns({ status: 'PENDING', size: 20 }),
    enabled: canHandleReturns,
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Title1 as="h1">{t('dashboard.title')}</Title1>
        <Body1>{t('dashboard.description')}</Body1>
      </div>

      {canApproveReview && (
        <PendingList
          title={t('dashboard.pendingReviews')}
          loading={pendingReviews.isLoading}
          items={pendingReviews.data?.items ?? []}
          empty={t('dashboard.noPendingReviews')}
          rowLabel={(s) => `${s.shipmentNo} · ${s.shipperName ?? s.shipperUnitId} → ${s.receiverName ?? s.receiverUnitId}`}
        />
      )}

      {canCount && (
        <PendingList
          title={t('dashboard.pendingCounting')}
          loading={pendingCount.isLoading}
          items={pendingCount.data?.items ?? []}
          empty={t('dashboard.noPendingCounting')}
          rowLabel={(s) => `${s.shipmentNo} · ${s.shipperName ?? s.shipperUnitId} → ${s.receiverName ?? s.receiverUnitId}`}
        />
      )}

      {canHandleReturns && (
        <ReturnPendingList
          title={t('dashboard.pendingReturns')}
          loading={pendingReturns.isLoading}
          items={pendingReturns.data?.items ?? []}
          empty={t('dashboard.noPendingReturns')}
        />
      )}
    </div>
  );
}

function ReturnPendingList({
  title,
  loading,
  items,
  empty,
}: {
  title: string;
  loading: boolean;
  items: ReturnOrderDto[];
  empty: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <Text as="h2" weight="semibold" size={400}>
        {title}
      </Text>
      {loading ? (
        <Spinner size="tiny" />
      ) : items.length === 0 ? (
        <Text className="text-neutral-500">{empty}</Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((order) => (
            <li key={order.id} className="rounded-lg border border-neutral-200 p-3">
              <Link to={`/returns/${order.id}`} className="hover:underline">
                <span className="font-medium">{order.returnNo}</span>
                <span className="ml-2 text-sm text-neutral-500">
                  {order.shipmentNo ?? ''} · {order.fromUnitName ?? order.fromUnitId}
                </span>
                <span className="ml-2 text-sm text-neutral-500">
                  {t(`returns.statuses.${order.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingList({
  title,
  loading,
  items,
  empty,
  rowLabel,
}: {
  title: string;
  loading: boolean;
  items: ShipmentDto[];
  empty: string;
  rowLabel: (s: ShipmentDto) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <Text as="h2" weight="semibold" size={400}>
        {title}
      </Text>
      {loading ? (
        <Spinner size="tiny" />
      ) : items.length === 0 ? (
        <Text className="text-neutral-500">{empty}</Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <li key={s.id} className="rounded-lg border border-neutral-200 p-3">
              <Link
                to={`/shipments/${s.id}`}
                className="hover:underline"
              >
                <span className="font-medium">{rowLabel(s)}</span>
                <span className="ml-2 text-sm text-neutral-500">{t(`shipments.statuses.${s.status}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
