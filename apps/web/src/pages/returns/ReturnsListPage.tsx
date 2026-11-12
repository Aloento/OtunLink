import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import {
  RETURN_SOURCE_TYPES,
  RETURN_STATUSES,
  type ReturnOrderDto,
  type ReturnSourceType,
  type ReturnStatus,
} from '@otunlink/shared';

import { listReturns } from '../../api/returns';
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

/** ：SALES 来源的售后状态机（REQUESTED → APPROVED → RETURNED；拒绝 → CANCELLED）。 */
const SALES_RETURN_STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'APPROVED',
  'RETURNED',
  'CANCELLED',
];

// 状态色：待处理给警示色，流转完成给成功色，已拒绝 / 已取消退回中性色。
// 徽标里始终带文字，颜色不是唯一区分手段。
const STATUS_TONE: Record<ReturnStatus, BadgeTone> = {
  PENDING: 'warning',
  REQUESTED: 'warning',
  APPROVED: 'warning',
  RETURNED: 'success',
  CLOSED: 'success',
  REJECTED: 'neutral',
  CANCELLED: 'neutral',
};

// 退货单列表（发货退货 + 零售售后）：两种来源合成一张表，用「来源」列与筛选区分，
// 搜索与筛选全部走服务端，行点击进详情。
export function ReturnsListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [source, setSource] = useState<ReturnSourceType | ''>('');
  const [status, setStatus] = useState<ReturnStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 搜索 / 筛选 / 每页条数一变就回第 1 页：否则会停在「第 7 页 / 共 1 页」的空表上。
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, source, status, pageSize]);

  const statuses = source === 'SALES' ? SALES_RETURN_STATUSES : RETURN_STATUSES;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['return-orders', 'list', debouncedQ, source, status, page, pageSize],
    queryFn: () =>
      listReturns({
        q: debouncedQ || undefined,
        status: status || undefined,
        sourceType: source || undefined,
        page,
        size: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Boolean(debouncedQ || source || status);

  // 关联单号：发货退货指向发货单，零售售后指向销售单；有 id 才给链接。
  const relatedOf = (order: ReturnOrderDto): { no: string | null; to: string | null } => {
    if (order.sourceType === 'SALES') {
      return {
        no: order.salesOrderNo ?? null,
        to: order.salesOrderId ? `/sales/${order.salesOrderId}` : null,
      };
    }
    return {
      no: order.shipmentNo ?? null,
      to: order.shipmentId ? `/shipments/${order.shipmentId}` : null,
    };
  };

  const clearFilters = () => {
    setQ('');
    setSource('');
    setStatus('');
  };

  const columns: DataTableColumn<ReturnOrderDto>[] = [
    {
      id: 'returnNo',
      header: t('returns.returnNo'),
      width: 156,
      minWidth: 120,
      hideable: false,
      cell: (order) => (
        <Link
          to={`/returns/${order.id}`}
          // 行本身可点，链接自己拦截冒泡，避免同一个跳转触发两次
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-brand-700 hover:underline"
        >
          {order.returnNo}
        </Link>
      ),
    },
    {
      id: 'status',
      header: t('returns.status'),
      width: 96,
      cell: (order) => (
        <Badge tone={STATUS_TONE[order.status]}>{t(`returns.statuses.${order.status}`)}</Badge>
      ),
    },
    {
      id: 'sourceType',
      header: t('returns.sourceType'),
      width: 104,
      cell: (order) => t(`returns.sources.${order.sourceType}`),
    },
    {
      id: 'relatedNo',
      header: t('returns.relatedNo'),
      width: 150,
      cell: (order) => {
        const related = relatedOf(order);
        if (!related.no) return <span className="text-ink-subtle">—</span>;
        if (!related.to) return <span className="tabular-nums">{related.no}</span>;
        return (
          <Link
            to={related.to}
            onClick={(event) => event.stopPropagation()}
            className="tabular-nums text-brand-700 hover:underline"
          >
            {related.no}
          </Link>
        );
      },
    },
    {
      id: 'route',
      header: t('returns.route'),
      width: 220,
      minWidth: 160,
      cell: (order) =>
        `${order.fromUnitName ?? order.fromUnitId} → ${order.toUnitName ?? order.toUnitId}`,
    },
    {
      id: 'createdAt',
      header: t('returns.createdAt'),
      width: 168,
      cell: (order) => (
        <span className="tabular-nums">{formatDateTime(order.createdAt, locale)}</span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader title={t('returns.title')} description={t('returns.total', { total })} />

      <DataTable
        tableId="returns"
        caption={t('returns.title')}
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(order) => order.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<Undo2 aria-hidden />}
            title={filtered ? t('returns.noMatch') : t('returns.empty')}
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        }
        onRowClick={(order) => navigate(`/returns/${order.id}`)}
        getRowLabel={(order) => `${order.returnNo} ${t(`returns.sources.${order.sourceType}`)}`}
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        toolbar={
          <FilterBar
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder={t('returns.searchPlaceholder')}
            extra={
              <>
                <Select
                  value={source}
                  onValueChange={(value) => {
                    setSource(value as ReturnSourceType | '');
                    // 两种来源的状态机不同，换来源时旧状态可能不再合法，直接清掉。
                    setStatus('');
                  }}
                  className="w-40"
                  aria-label={t('returns.sourceType')}
                >
                  <option value="">{t('returns.sourceAll')}</option>
                  {RETURN_SOURCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`returns.sources.${type}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as ReturnStatus | '')}
                  className="w-36"
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
            right={<RefreshButton queryKey={['return-orders', 'list']} />}
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
            // 服务端 size 上限 50，给出 100 会让「第 x–y 条」与实际返回行数错位。
            pageSizeOptions={[20, 50]}
          />
        }
      />
    </div>
  );
}
