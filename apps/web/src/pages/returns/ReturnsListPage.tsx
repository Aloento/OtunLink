import { Button, Select, Spinner, Tab, TabList, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import {
  RETURN_STATUSES,
  type ReturnOrderDto,
  type ReturnSourceType,
  type ReturnStatus,
} from '@otunlink/shared';

import { listReturns } from '../../api/returns';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

/** ：SALES 来源的售后状态机（REQUESTED → APPROVED → RETURNED；拒绝 → CANCELLED）。 */
const SALES_RETURN_STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'APPROVED',
  'RETURNED',
  'CANCELLED',
];

type SourceTab = 'SHIPMENT' | 'SALES';

// 退货单列表（发货退货 + 零售售后）：按来源 Tab 切换。
export function ReturnsListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const [source, setSource] = useState<SourceTab>('SHIPMENT');
  const [status, setStatus] = useState<ReturnStatus | ''>('');
  const [page, setPage] = useState(1);

  const statuses = source === 'SALES' ? SALES_RETURN_STATUSES : RETURN_STATUSES;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['return-orders', 'list', source, status || undefined, page],
    queryFn: () =>
      listReturns({ sourceType: source, status: status || undefined, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns: ResponsiveTableColumn<ReturnOrderDto>[] = [
    {
      key: 'returnNo',
      header: t('returns.returnNo'),
      render: (order) => (
        <Link to={`/returns/${order.id}`} className="font-medium text-blue-600 hover:underline">
          {order.returnNo}
        </Link>
      ),
    },
    ...(source === 'SALES'
      ? [
          {
            key: 'salesOrderNo',
            header: t('returns.salesOrderNo'),
            render: (order: ReturnOrderDto) => order.salesOrderNo ?? '—',
          } as ResponsiveTableColumn<ReturnOrderDto>,
        ]
      : [
          {
            key: 'shipmentNo',
            header: t('returns.shipmentNo'),
            render: (order: ReturnOrderDto) => order.shipmentNo ?? '—',
          } as ResponsiveTableColumn<ReturnOrderDto>,
        ]),
    {
      key: 'route',
      header: t('returns.route'),
      render: (order) =>
        `${order.fromUnitName ?? order.fromUnitId} → ${order.toUnitName ?? order.toUnitId}`,
    },
    {
      key: 'status',
      header: t('returns.status'),
      render: (order) => (
        <span
          className={
            order.status === 'CANCELLED' || order.status === 'REJECTED'
              ? 'text-neutral-400'
              : order.status === 'RETURNED' || order.status === 'CLOSED'
                ? 'text-green-600'
                : 'text-amber-600'
          }
        >
          {t(`returns.statuses.${order.status}`)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: t('returns.createdAt'),
      render: (order) => (order.createdAt ? formatDateTime(order.createdAt, locale) : '—'),
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const switchSource = (next: SourceTab) => {
    setSource(next);
    setStatus('');
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('returns.title')}</Title1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKey={['return-orders', 'list']} />
          <Select
            value={status}
            onChange={(_, d) => {
              setStatus(d.value as ReturnStatus | '');
              setPage(1);
            }}
            className="min-w-40"
            aria-label={t('returns.status')}
          >
            <option value="">{t('returns.allStatuses')}</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {t(`returns.statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <TabList selectedValue={source} onTabSelect={(_, d) => switchSource(d.value as SourceTab)}>
        <Tab value="SHIPMENT">{t('returns.tabShipment')}</Tab>
        <Tab value="SALES">{t('returns.tabSales')}</Tab>
      </TabList>

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
            emptyText={t('returns.empty')}
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('returns.total', { total })}</span>
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
