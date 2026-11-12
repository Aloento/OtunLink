import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowUpFromLine, Ellipsis, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import {
  OUTBOUND_STATUSES,
  OUTBOUND_TYPES,
  type OutboundOrderDto,
  type OutboundStatus,
  type OutboundType,
} from '@otunlink/shared';

import { listOutboundOrders } from '../../api/outbound';
import { RefreshButton } from '../../components/RefreshButton';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime, formatNumber } from '../../i18n/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { DataTable, TablePager, type DataTableColumn } from '../../ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Empty } from '../../ui/empty';
import { FilterBar } from '../../ui/filter-bar';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';

const DEFAULT_PAGE_SIZE = 20;
// 服务端把 size 夹在 1–50，选项里不要出现 100：否则「每页 100 条」实际只回来 50 行，
// 分页条的「第 x–y 条 / 共 n 条」会自我矛盾。
const PAGE_SIZE_OPTIONS = [20, 50];

interface OrderSummary {
  /** 明细行数。 */
  count: number;
  /** 明细数量合计（qty 是 decimal 字符串，求和后按 locale 格式化）。 */
  qty: number;
}

// 明细行数与数量合计由列表接口聚合返回（itemCount / totalQty），前端不再逐单拉详情。
export function OutboundListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [type, setType] = useState<OutboundType | ''>('');
  const [status, setStatus] = useState<OutboundStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 搜索、筛选、页大小变化都回第 1 页：否则会停在「第 7 页 / 共 1 页」的空列表上
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, type, status, pageSize]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['outbound-orders', 'list', debouncedQ, type || undefined, status || undefined, page, pageSize],
    queryFn: () =>
      listOutboundOrders({
        q: debouncedQ || undefined,
        type: type || undefined,
        status: status || undefined,
        page,
        size: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = debouncedQ.length > 0 || type !== '' || status !== '';

  const columns: DataTableColumn<OutboundOrderDto>[] = [
    {
      id: 'outboundNo',
      header: t('outbound.outboundNo'),
      width: 170,
      minWidth: 130,
      sticky: true,
      // 单号是这张表的身份列，藏起来就认不出任何一个单据
      hideable: false,
      cell: (order) => (
        <Link
          to={`/outbound/${order.id}`}
          // 行本身可点，链接自己拦截冒泡，避免同一个跳转触发两次
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-brand-700 hover:underline"
        >
          {order.outboundNo}
        </Link>
      ),
    },
    {
      id: 'type',
      header: t('outbound.type'),
      width: 112,
      cell: (order) => (
        // 徽标始终带文字：报损与普通出库的差别不能只靠颜色
        <Badge tone={order.type === 'LOSS' ? 'danger' : 'neutral'}>
          {t(`outbound.types.${order.type}`)}
        </Badge>
      ),
    },
    {
      id: 'status',
      header: t('outbound.status'),
      width: 96,
      cell: (order) => (
        <Badge tone={order.status === 'POSTED' ? 'success' : 'warning'}>
          {t(`outbound.statuses.${order.status}`)}
        </Badge>
      ),
    },
    {
      id: 'warehouse',
      header: t('outbound.warehouse'),
      width: 140,
      cell: (order) => order.warehouseName ?? order.warehouseUnitId,
    },
    {
      id: 'counterparty',
      header: t('outbound.counterparty'),
      width: 150,
      cell: (order) => order.counterpartyName ?? order.counterpartyUnitId ?? '—',
    },
    {
      id: 'itemCount',
      header: t('outbound.itemCount'),
      width: 96,
      minWidth: 80,
      align: 'end',
      cell: (order) => (
        <span className="tabular-nums">{order.itemCount != null ? String(order.itemCount) : '—'}</span>
      ),
    },
    {
      id: 'totalQty',
      header: t('outbound.totalQty'),
      width: 112,
      minWidth: 88,
      align: 'end',
      cell: (order) => (
        <span className="tabular-nums">
          {order.totalQty != null ? formatNumber(Number(order.totalQty), locale) : '—'}
        </span>
      ),
    },
    {
      id: 'createdAt',
      header: t('outbound.createdAt'),
      width: 168,
      cell: (order) => <span className="tabular-nums">{formatDateTime(order.createdAt, locale)}</span>,
    },
  ];

  const clearFilters = () => {
    setQ('');
    setType('');
    setStatus('');
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('outbound.title')}
        description={t('outbound.total', { total })}
        actions={
          <Button asChild variant="primary">
            <Link to="/outbound/new">{t('outbound.newOutbound')}</Link>
          </Button>
        }
      />

      <DataTable
        tableId="outbound-orders"
        caption={t('outbound.title')}
        columns={columns}
        rows={rows}
        rowKey={(order) => order.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<ArrowUpFromLine aria-hidden />}
            // 「库里没有」和「筛掉了」是两种处境，文案与动作都要分开
            title={filtered ? t('outbound.noMatch') : t('outbound.empty')}
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              ) : (
                <Button asChild variant="primary">
                  <Link to="/outbound/new">{t('outbound.newOutbound')}</Link>
                </Button>
              )
            }
          />
        }
        onRowClick={(order) => navigate(`/outbound/${order.id}`)}
        getRowLabel={(order) => `${order.outboundNo} ${t(`outbound.statuses.${order.status}`)}`}
        rowActions={(order) => (
          // 行本身可点：菜单触发器与菜单项都不能把点击冒泡成「进入详情」
          <div
            className="flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t('common.actions')} ${order.outboundNo}`}
                >
                  <Ellipsis aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => navigate(`/outbound/${order.id}`)}>
                  <Eye aria-hidden className="size-3.5" />
                  {t('outbound.detail')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        toolbar={
          <FilterBar
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder={t('outbound.searchPlaceholder')}
            extra={
              <>
                <Select
                  value={type}
                  onValueChange={(next) => setType(next as OutboundType | '')}
                  className="w-32"
                  aria-label={t('outbound.type')}
                >
                  <option value="">{t('outbound.allTypes')}</option>
                  {OUTBOUND_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {t(`outbound.types.${v}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={status}
                  onValueChange={(next) => setStatus(next as OutboundStatus | '')}
                  className="w-32"
                  aria-label={t('outbound.status')}
                >
                  <option value="">{t('outbound.allStatuses')}</option>
                  {OUTBOUND_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`outbound.statuses.${s}`)}
                    </option>
                  ))}
                </Select>
              </>
            }
            right={<RefreshButton queryKey={['outbound-orders', 'list']} />}
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
