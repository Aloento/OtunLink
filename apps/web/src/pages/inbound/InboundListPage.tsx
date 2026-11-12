import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ellipsis, Eye, PackageCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { INBOUND_STATUSES, type InboundOrderDto, type InboundStatus } from '@otunlink/shared';

import { listInbounds } from '../../api/inbound';
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

// 列表接口只返回单据主表字段，明细行数与数量合计只存在于详情里。
// 为了这两列显示真数据，这里按当前页的行批量取详情并汇总：每张单据用自己的 id 做 key，
// 与详情页共享缓存（staleTime 5 分钟），翻页回来不重复请求，单行失败也只是这一行显示「—」。
// 后端在 list 响应里补 itemCount / totalQty 之后，这段 fan-out 应整体删掉（见 docs/ui-redesign.md §3）。
// 入库单列表：确认收货自动建档的 DRAFT / POSTED + 手工入库单（sourceType=MANUAL）。
// 结构固定为「页头 → 筛选条 → 数据表 → 分页条」，搜索走服务端（单号 / 往来单位），行内直接进详情。
export function InboundListPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [status, setStatus] = useState<InboundStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 搜索、筛选、页大小变化都回第 1 页：否则会停在「第 7 页 / 共 1 页」的空列表上
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, pageSize]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbound-orders', 'list', debouncedQ, status || undefined, page, pageSize],
    queryFn: () =>
      listInbounds({
        q: debouncedQ || undefined,
        status: status || undefined,
        page,
        size: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = debouncedQ.length > 0 || status !== '';

  const columns: DataTableColumn<InboundOrderDto>[] = [
    {
      id: 'inboundNo',
      header: t('inbound.inboundNo'),
      width: 170,
      minWidth: 130,
      sticky: true,
      // 单号是这张表的身份列，藏起来就认不出任何一个单据
      hideable: false,
      cell: (order) => (
        <Link
          to={`/inbound/${order.id}`}
          // 行本身可点，链接自己拦截冒泡，避免同一个跳转触发两次
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-brand-700 hover:underline"
        >
          {order.inboundNo}
        </Link>
      ),
    },
    {
      id: 'status',
      header: t('inbound.status'),
      width: 96,
      cell: (order) => (
        // 徽标始终带文字，状态不靠颜色单独表达
        <Badge tone={order.status === 'POSTED' ? 'success' : 'warning'}>
          {t(`inbound.statuses.${order.status}`)}
        </Badge>
      ),
    },
    {
      id: 'sourceType',
      header: t('inbound.sourceType'),
      width: 112,
      cell: (order) => (
        <Badge tone={order.sourceType === 'MANUAL' ? 'neutral' : 'brand'}>
          {t(`inbound.sourceTypes.${order.sourceType}`)}
        </Badge>
      ),
    },
    {
      id: 'warehouse',
      header: t('inbound.warehouse'),
      width: 140,
      cell: (order) => order.warehouseName ?? order.warehouseUnitId,
    },
    {
      id: 'shipmentNo',
      header: t('inbound.shipmentNo'),
      width: 150,
      cell: (order) => order.shipmentNo ?? '—',
    },
    {
      id: 'counterparty',
      header: t('inbound.counterparty'),
      width: 150,
      cell: (order) => order.counterpartyName ?? '—',
    },
    {
      id: 'itemCount',
      header: t('inbound.itemCount'),
      width: 96,
      minWidth: 80,
      align: 'end',
      cell: (order) => (
        <span className="tabular-nums">{order.itemCount != null ? String(order.itemCount) : '—'}</span>
      ),
    },
    {
      id: 'totalQty',
      header: t('inbound.totalQty'),
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
      header: t('inbound.createdAt'),
      width: 168,
      cell: (order) => <span className="tabular-nums">{formatDateTime(order.createdAt, locale)}</span>,
    },
  ];

  const clearFilters = () => {
    setQ('');
    setStatus('');
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('inbound.title')}
        description={t('inbound.total', { total })}
        actions={
          <Button asChild variant="primary">
            <Link to="/inbound/new">{t('inbound.manualCreateTitle')}</Link>
          </Button>
        }
      />

      <DataTable
        tableId="inbound-orders"
        caption={t('inbound.title')}
        columns={columns}
        rows={rows}
        rowKey={(order) => order.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<PackageCheck aria-hidden />}
            // 「库里没有」和「筛掉了」是两种处境，文案与动作都要分开
            title={filtered ? t('inbound.noMatch') : t('inbound.empty')}
            action={
              filtered ? (
                <Button variant="secondary" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              ) : (
                <Button asChild variant="primary">
                  <Link to="/inbound/new">{t('inbound.manualCreateTitle')}</Link>
                </Button>
              )
            }
          />
        }
        onRowClick={(order) => navigate(`/inbound/${order.id}`)}
        getRowLabel={(order) => `${order.inboundNo} ${t(`inbound.statuses.${order.status}`)}`}
        rowActions={(order) => (
          // 行本身可点：菜单触发器与菜单项都不能把点击冒泡成「进入详情」
          <div
            className="flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label={`${t('common.actions')} ${order.inboundNo}`}>
                  <Ellipsis aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => navigate(`/inbound/${order.id}`)}>
                  <Eye aria-hidden className="size-3.5" />
                  {t('inbound.detail')}
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
            searchPlaceholder={t('inbound.searchPlaceholder')}
            extra={
              <Select
                value={status}
                onValueChange={(next) => setStatus(next as InboundStatus | '')}
                className="w-32"
                aria-label={t('inbound.status')}
              >
                <option value="">{t('inbound.allStatuses')}</option>
                {INBOUND_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`inbound.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            }
            right={<RefreshButton queryKey={['inbound-orders', 'list']} />}
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
