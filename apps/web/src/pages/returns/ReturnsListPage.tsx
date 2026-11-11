import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { RETURN_STATUSES, type ReturnOrderDto, type ReturnStatus } from '@otunlink/shared';

import { listReturns } from '../../api/returns';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

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
        <Link to={`/returns/${order.id}`} className="font-medium text-brand-700 hover:underline">
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
              ? 'text-ink-subtle'
              : order.status === 'RETURNED' || order.status === 'CLOSED'
                ? 'text-success-600'
                : 'text-warning-700'
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

  // 两个来源 Tab 共用同一段列表渲染逻辑（分页条 + 表格），避免各写一份。
  const renderList = () => (
    <>
      <ResponsiveTable
        columns={columns}
        items={data?.items ?? []}
        rowKey={(order) => order.id}
        emptyText={t('returns.empty')}
        label={t('returns.title')}
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={setPage}
        totalLabel={t('returns.total', { total })}
      />
    </>
  );

  // 加载 / 失败 / 列表三态；两个面板共用，避免状态分支重复。
  const renderPanel = () =>
    isLoading ? (
      <Spinner label={t('common.loading')} />
    ) : isError ? (
      <p role="alert" className="text-sm text-danger-600">
        {t('errors.UNKNOWN')}
      </p>
    ) : (
      renderList()
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('returns.title')}
        actions={
          <>
            <RefreshButton queryKey={['return-orders', 'list']} />
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as ReturnStatus | '');
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
          </>
        }
      />

      <Tabs
        value={source}
        onValueChange={(next) => switchSource(next as SourceTab)}
        className="flex flex-col gap-4"
      >
        <TabsList>
          <TabsTrigger value="SHIPMENT">{t('returns.tabShipment')}</TabsTrigger>
          <TabsTrigger value="SALES">{t('returns.tabSales')}</TabsTrigger>
        </TabsList>

        <TabsContent value="SHIPMENT">{renderPanel()}</TabsContent>
        <TabsContent value="SALES">{renderPanel()}</TabsContent>
      </Tabs>
    </div>
  );
}
