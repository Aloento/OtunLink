import { Button, Select, Spinner, Tab, TabList, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import {
  OUTBOUND_STATUSES,
  OUTBOUND_TYPES,
  type OutboundOrderDto,
  type OutboundStatus,
  type OutboundType,
} from '@otunlink/shared';

import { listOutboundOrders } from '../../api/outbound';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

// 出库单列表：手工出库（NORMAL），草稿可过账。
export function OutboundListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const [status, setStatus] = useState<OutboundStatus | ''>('');
  const [type, setType] = useState<OutboundType | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['outbound-orders', 'list', status || undefined, type || undefined, page],
    queryFn: () =>
      listOutboundOrders({ status: status || undefined, type: type || undefined, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns: ResponsiveTableColumn<OutboundOrderDto>[] = [
    {
      key: 'outboundNo',
      header: t('outbound.outboundNo'),
      render: (order) => (
        <Link to={`/outbound/${order.id}`} className="font-medium text-blue-600 hover:underline">
          {order.outboundNo}
        </Link>
      ),
    },
    {
      key: 'type',
      header: t('outbound.type'),
      render: (order) => t(`outbound.types.${order.type}`),
    },
    {
      key: 'warehouse',
      header: t('outbound.warehouse'),
      render: (order) => order.warehouseName ?? order.warehouseUnitId,
    },
    {
      key: 'counterparty',
      header: t('outbound.counterparty'),
      render: (order) => order.counterpartyName ?? order.counterpartyUnitId ?? '—',
    },
    {
      key: 'status',
      header: t('outbound.status'),
      render: (order) => t(`outbound.statuses.${order.status}`),
    },
    {
      key: 'createdAt',
      header: t('outbound.createdAt'),
      render: (order) => (order.createdAt ? formatDateTime(order.createdAt, locale) : '—'),
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('outbound.title')}</Title1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKey={['outbound-orders', 'list']} />
          <TabList
            selectedValue={type || 'all'}
            onTabSelect={(_, d) => {
              setType(d.value === 'all' ? '' : (d.value as OutboundType));
              setPage(1);
            }}
          >
            <Tab value="all">{t('outbound.allTypes')}</Tab>
            {OUTBOUND_TYPES.map((v) => (
              <Tab key={v} value={v}>
                {t(`outbound.types.${v}`)}
              </Tab>
            ))}
          </TabList>
          <Select
            value={status}
            onChange={(_, d) => {
              setStatus(d.value as OutboundStatus | '');
              setPage(1);
            }}
            aria-label={t('outbound.status')}
          >
            <option value="">{t('outbound.allStatuses')}</option>
            {OUTBOUND_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`outbound.statuses.${s}`)}
              </option>
            ))}
          </Select>
          <Link to="/outbound/new">
            <Button appearance="primary">{t('outbound.newOutbound')}</Button>
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
            emptyText={t('outbound.empty')}
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('outbound.total', { total })}</span>
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
