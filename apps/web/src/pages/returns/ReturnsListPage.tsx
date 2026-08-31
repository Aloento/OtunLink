import { Button, Select, Spinner, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { RETURN_STATUSES, type ReturnOrderDto, type ReturnStatus } from '@otunlink/shared';

import { listReturns } from '../../api/returns';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

// 退货单列表（ck-07 §6.1）：发货退货（拒收）闭环。
export function ReturnsListPage() {
  const { t } = useTranslation();

  const [status, setStatus] = useState<ReturnStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['return-orders', 'list', status || undefined, page],
    queryFn: () => listReturns({ status: status || undefined, page, size: PAGE_SIZE }),
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
    {
      key: 'shipmentNo',
      header: t('returns.shipmentNo'),
      render: (order) => order.shipmentNo ?? '—',
    },
    {
      key: 'route',
      header: t('returns.route'),
      render: (order) =>
        `${order.fromUnitName ?? order.fromUnitId} → ${order.toUnitName ?? order.toUnitId}`,
    },
    {
      key: 'status',
      header: t('returns.status'),
      render: (order) => t(`returns.statuses.${order.status}`),
    },
    {
      key: 'createdAt',
      header: t('returns.createdAt'),
      render: (order) => order.createdAt,
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('returns.title')}</Title1>
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
          {RETURN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`returns.statuses.${s}`)}
            </option>
          ))}
        </Select>
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
