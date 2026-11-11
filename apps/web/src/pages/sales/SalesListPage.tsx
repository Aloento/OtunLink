import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { SALES_STATUSES, type SalesOrderDto, type SalesStatus } from '@otunlink/shared';

import { listSalesOrders } from '../../api/sales';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

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
        <Link to={`/sales/${order.id}`} className="font-medium text-brand-700 hover:underline">
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
      // 金额右对齐 + 等宽数字：多行金额的个位/小数点才能对齐比较。
      render: (order) => (
        <span className="block text-end tabular-nums">
          {order.totalAmount === null ? '—' : `${order.totalAmount} ${order.currency}`}
        </span>
      ),
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
      <PageHeader
        title={t('sales.title')}
        actions={
          <>
            <RefreshButton queryKey={['sales-orders', 'list']} />
            <Select
              value={status}
              onValueChange={(next) => {
                setStatus(next as SalesStatus | '');
                setPage(1);
              }}
              aria-label={t('sales.status')}
              className="w-36"
            >
              <option value="">{t('sales.allStatuses')}</option>
              {SALES_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`sales.statuses.${s}`)}
                </option>
              ))}
            </Select>
            <Button asChild variant="primary">
              <Link to="/sales/new">{t('sales.newOrder')}</Link>
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
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            items={data?.items ?? []}
            rowKey={(order) => order.id}
            emptyText={t('sales.empty')}
            label={t('sales.title')}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            totalLabel={t('sales.total', { total })}
          />
        </>
      )}
    </div>
  );
}
