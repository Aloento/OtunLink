import { Button, Select, Spinner, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { INBOUND_STATUSES, type InboundOrderDto, type InboundStatus } from '@otunlink/shared';

import { listInbounds } from '../../api/inbound';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

// 入库单列表：确认收货自动建档的 DRAFT / POSTED。
export function InboundListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const [status, setStatus] = useState<InboundStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbound-orders', 'list', status || undefined, page],
    queryFn: () => listInbounds({ status: status || undefined, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns: ResponsiveTableColumn<InboundOrderDto>[] = [
    {
      key: 'inboundNo',
      header: t('inbound.inboundNo'),
      render: (order) => (
        <Link to={`/inbound/${order.id}`} className="font-medium text-blue-600 hover:underline">
          {order.inboundNo}
        </Link>
      ),
    },
    {
      key: 'sourceType',
      header: t('inbound.sourceType'),
      render: (order) => t(`inbound.sourceTypes.${order.sourceType}`),
    },
    {
      key: 'shipmentNo',
      header: t('inbound.shipmentNo'),
      render: (order) => order.shipmentNo ?? '—',
    },
    {
      key: 'warehouse',
      header: t('inbound.warehouse'),
      render: (order) => order.warehouseName ?? order.warehouseUnitId,
    },
    {
      key: 'status',
      header: t('inbound.status'),
      render: (order) => t(`inbound.statuses.${order.status}`),
    },
    {
      key: 'createdAt',
      header: t('inbound.createdAt'),
      render: (order) => (order.createdAt ? formatDateTime(order.createdAt, locale) : '—'),
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('inbound.title')}</Title1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKey={['inbound-orders', 'list']} />
          <Select
            value={status}
            onChange={(_, d) => {
              setStatus(d.value as InboundStatus | '');
              setPage(1);
            }}
            className="min-w-40"
            aria-label={t('inbound.status')}
          >
            <option value="">{t('inbound.allStatuses')}</option>
            {INBOUND_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`inbound.statuses.${s}`)}
              </option>
            ))}
          </Select>
          <Link to="/inbound/new">
            <Button appearance="primary">{t('inbound.manualCreateTitle')}</Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            items={data?.items ?? []}
            rowKey={(order) => order.id}
            emptyText={t('inbound.empty')}
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('inbound.total', { total })}</span>
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
