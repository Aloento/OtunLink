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
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

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
        <Link to={`/inbound/${order.id}`} className="font-medium text-brand-700 hover:underline">
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
      <PageHeader
        title={t('inbound.title')}
        actions={
          <>
            <RefreshButton queryKey={['inbound-orders', 'list']} />
            <Select
              value={status}
              onValueChange={(next) => {
                setStatus(next as InboundStatus | '');
                setPage(1);
              }}
              placeholder={t('inbound.allStatuses')}
              aria-label={t('inbound.status')}
              className="w-full min-w-0 sm:w-40"
            >
              {INBOUND_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`inbound.statuses.${s}`)}
                </option>
              ))}
            </Select>
            <Button asChild variant="primary">
              <Link to="/inbound/new">{t('inbound.manualCreateTitle')}</Link>
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
            emptyText={t('inbound.empty')}
            label={t('inbound.title')}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            totalLabel={t('inbound.total', { total })}
          />
        </>
      )}
    </div>
  );
}
