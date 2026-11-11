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
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

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
        <Link to={`/outbound/${order.id}`} className="font-medium text-brand-700 hover:underline">
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

  // 各 Tab 面板共用同一段渲染逻辑（数据由 type 查询参数决定）。
  const renderBody = () => {
    if (isLoading) return <Spinner label={t('common.loading')} />;
    if (isError) {
      return (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      );
    }
    return (
      <>
        <ResponsiveTable
          columns={columns}
          items={data?.items ?? []}
          rowKey={(order) => order.id}
          emptyText={t('outbound.empty')}
          label={t('outbound.title')}
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          totalLabel={t('outbound.total', { total })}
        />
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('outbound.title')}
        actions={
          <>
            <RefreshButton queryKey={['outbound-orders', 'list']} />
            <Select
              value={status}
              onValueChange={(next) => {
                setStatus(next as OutboundStatus | '');
                setPage(1);
              }}
              placeholder={t('outbound.allStatuses')}
              aria-label={t('outbound.status')}
              className="w-full min-w-0 sm:w-40"
            >
              {OUTBOUND_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`outbound.statuses.${s}`)}
                </option>
              ))}
            </Select>
            <Button asChild variant="primary">
              <Link to="/outbound/new">{t('outbound.newOutbound')}</Link>
            </Button>
          </>
        }
      />

      <Tabs
        value={type || 'all'}
        onValueChange={(next) => {
          setType(next === 'all' ? '' : (next as OutboundType));
          setPage(1);
        }}
        className="flex flex-col gap-4"
      >
        <TabsList>
          <TabsTrigger value="all">{t('outbound.allTypes')}</TabsTrigger>
          {OUTBOUND_TYPES.map((v) => (
            <TabsTrigger key={v} value={v}>
              {t(`outbound.types.${v}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="all">{renderBody()}</TabsContent>
        {OUTBOUND_TYPES.map((v) => (
          <TabsContent key={v} value={v}>
            {renderBody()}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
