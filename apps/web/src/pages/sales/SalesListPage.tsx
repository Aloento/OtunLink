import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { SALES_STATUSES, type SalesOrderDto, type SalesStatus } from '@otunlink/shared';

import { listSalesOrders } from '../../api/sales';
import { RefreshButton } from '../../components/RefreshButton';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Badge, type BadgeTone } from '../../ui/badge';
import { Button } from '../../ui/button';
import { DataTable, TablePager, type DataTableColumn } from '../../ui/data-table';
import { Empty } from '../../ui/empty';
import { FilterBar } from '../../ui/filter-bar';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';

const DEFAULT_PAGE_SIZE = 20;
// 服务端把 size 夹在 1–50，选项里不要出现 100：否则「每页 100 条」实际只回来 50 行，
// 「第 x–y 条」的区间会和真实数据错位。
const PAGE_SIZE_OPTIONS = [20, 50];

// 状态色：草稿中性、已发送主色、待确认收款警示、已确认成功、已取消危险。
// 徽标里始终带文字，颜色不是唯一区分手段。
const STATUS_TONE: Record<SalesStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'brand',
  PAYMENT_UPLOADED: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

// 销售单列表：门店请货 + 仓库主动送货，按状态筛选。
// 搜索与筛选全部走服务端，行点击进详情；行内不再堆操作按钮。
export function SalesListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [status, setStatus] = useState<SalesStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 搜索 / 筛选 / 每页条数一变就回第 1 页：否则会停在「第 7 页 / 共 1 页」的空表上。
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, pageSize]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-orders', 'list', debouncedQ, status, page, pageSize],
    queryFn: () =>
      listSalesOrders({
        q: debouncedQ || undefined,
        status: status || undefined,
        page,
        size: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Boolean(debouncedQ || status);

  const clearFilters = () => {
    setQ('');
    setStatus('');
  };

  const columns: DataTableColumn<SalesOrderDto>[] = [
    {
      id: 'salesNo',
      header: t('sales.salesNo'),
      width: 156,
      minWidth: 120,
      hideable: false,
      cell: (order) => (
        <Link
          to={`/sales/${order.id}`}
          // 行本身可点，链接自己拦截冒泡，避免同一个跳转触发两次
          onClick={(event) => event.stopPropagation()}
          className="tabular-nums font-medium text-brand-700 hover:underline"
        >
          {order.salesNo}
        </Link>
      ),
    },
    {
      id: 'status',
      header: t('sales.status'),
      width: 96,
      cell: (order) => (
        <Badge tone={STATUS_TONE[order.status]}>{t(`sales.statuses.${order.status}`)}</Badge>
      ),
    },
    {
      id: 'source',
      header: t('sales.source'),
      width: 128,
      cell: (order) => t(`sales.sources.${order.source}`),
    },
    {
      id: 'deliveryMethod',
      header: t('sales.deliveryMethod'),
      width: 104,
      cell: (order) => t(`sales.deliveryMethods.${order.deliveryMethod}`),
    },
    {
      id: 'totalAmount',
      header: t('sales.totalAmount'),
      width: 132,
      align: 'end',
      // 金额右对齐 + 等宽数字：多行金额的个位/小数点才能对齐比较。
      // 没有金额时给破折号，不要补一个假的 0。
      cell: (order) =>
        order.totalAmount === null ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className="tabular-nums">{`${order.totalAmount} ${order.currency}`}</span>
        ),
    },
    {
      id: 'createdAt',
      header: t('sales.createdAt'),
      width: 168,
      cell: (order) => (
        <span className="tabular-nums">{formatDateTime(order.createdAt, locale)}</span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('sales.title')}
        description={t('sales.total', { total })}
        actions={
          <Button asChild variant="primary">
            <Link to="/sales/new">{t('sales.newOrder')}</Link>
          </Button>
        }
      />

      <DataTable
        tableId="sales-orders"
        caption={t('sales.title')}
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(order) => order.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<ClipboardList aria-hidden />}
            // 「库里没有」和「筛掉了」是两种处境，文案与动作都要分开
            title={filtered ? t('sales.noMatch') : t('sales.empty')}
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        }
        onRowClick={(order) => navigate(`/sales/${order.id}`)}
        getRowLabel={(order) => `${order.salesNo} ${t(`sales.statuses.${order.status}`)}`}
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        toolbar={
          <FilterBar
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder={t('sales.searchPlaceholder')}
            extra={
              <Select
                value={status}
                onValueChange={(next) => setStatus(next as SalesStatus | '')}
                className="w-36"
                aria-label={t('sales.status')}
              >
                <option value="">{t('sales.allStatuses')}</option>
                {SALES_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`sales.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            }
            right={<RefreshButton queryKey={['sales-orders', 'list']} />}
          />
        }
        footer={
          <TablePager
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        }
      />
    </div>
  );
}
