import { Button, Select, Spinner, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { SALES_STATUSES, type SalesOrderDto, type SalesStatus } from '@otunlink/shared';

import { listSalesOrders } from '../../api/sales';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

// 销售单列表：门店请货 + 仓库主动送货，按状态筛选。
export function SalesListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const [status, setStatus] = useState<SalesStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-orders', 'list', status || undefined, page],
    queryFn: () => listSalesOrders({ status: status || undefined, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const columns: ResponsiveTableColumn<SalesOrderDto>[] = [
    {
      key: 'salesNo',
      header: t('sales.salesNo'),
      render: (order) => (
        <Link to={`/sales/${order.id}`} className="font-medium text-blue-600 hover:underline">
          {order.salesNo}
        </Link>
      ),
    },
    {
      key: 'source',
      header: t('sales.source'),
      render: (order) => t(`sales.sources.${order.source}`),
    },
    {
      key: 'seller',
      header: t('sales.seller'),
      render: (order) => order.sellerUnitName ?? order.sellerUnitId,
    },
    {
      key: 'buyer',
      header: t('sales.buyer'),
      render: (order) => order.buyerUnitName ?? order.buyerUnitId,
    },
    {
      key: 'status',
      header: t('sales.status'),
      render: (order) => t(`sales.statuses.${order.status}`),
    },
    {
      key: 'totalAmount',
      header: t('sales.totalAmount'),
      render: (order) => (order.totalAmount === null ? '—' : `${order.totalAmount} ${order.currency}`),
    },
    {
      key: 'createdAt',
      header: t('sales.createdAt'),
      render: (order) => (order.createdAt ? formatDateTime(order.createdAt, locale) : '—'),
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('sales.title')}</Title1>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onChange={(_, d) => {
              setStatus(d.value as SalesStatus | '');
              setPage(1);
            }}
            aria-label={t('sales.status')}
          >
            <option value="">{t('sales.allStatuses')}</option>
            {SALES_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`sales.statuses.${s}`)}
              </option>
            ))}
          </Select>
          <Link to="/sales/new">
            <Button appearance="primary">{t('sales.newOrder')}</Button>
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
            emptyText={t('sales.empty')}
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('sales.total', { total })}</span>
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
