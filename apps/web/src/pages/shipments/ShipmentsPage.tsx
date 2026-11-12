import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ellipsis, Pencil, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import {
  Permissions,
  SHIPMENT_STATUSES,
  hasPermission,
  type ShipmentDto,
  type ShipmentStatus,
} from '@otunlink/shared';

import { listShipments } from '../../api/shipments';
import { useSession } from '../../auth/SessionProvider';
import { RefreshButton } from '../../components/RefreshButton';
import { formatDateTime, formatNumber } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Badge, type BadgeTone } from '../../ui/badge';
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

// 状态用「色块 + 文案」表达：颜色只是加速识别的第二线索，文字永远在。
const STATUS_TONE: Record<ShipmentStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'brand',
  COUNTING: 'warning',
  READY: 'brand',
  DISCREPANCY: 'danger',
  REVIEW_PENDING: 'warning',
  INBOUNDED: 'success',
  RETURN_PENDING: 'warning',
  RETURNED: 'neutral',
};

// 列表聚合字段：物品行数与数量合计属于「按单聚合」，当前列表 DTO 尚未返回
// （ShipmentDto 只有 boxesCount / trackings）。这里按可选字段读取，后端补上
// 聚合列后这一列自动有值；没补时如实显示「—」，不拿箱数冒充物品数。
type ShipmentListRow = ShipmentDto & {
  itemsCount?: number;
  totalQty?: string | number;
};

// 发货单列表：发货方（集货）与收货方（仓库）看同一张表，但「对方单位」不同。
// 结构固定为「页头 → 筛选条 → 数据表 → 分页条」，搜索与状态筛选都走服务端。
export function ShipmentsPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const navigate = useNavigate();

  const canCreate = hasPermission(me?.role, Permissions.SHIPMENTS_CREATE);

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [status, setStatus] = useState<ShipmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 搜索/筛选/每页条数变化都要回到第 1 页：否则会停在「第 7 页 / 共 1 页」的空表上。
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status, pageSize]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['shipments', 'list', debouncedQ, status, page, pageSize],
    queryFn: () =>
      listShipments({
        q: debouncedQ || undefined,
        status: status || undefined,
        page,
        size: pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = (data?.items ?? []) as ShipmentListRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Boolean(debouncedQ || status);

  // 「对方单位」：站在当前用户所属单元看，另一头是谁。
  // - 我是发货方 → 对面是收货仓库（发往）；
  // - 我是收货方 → 对面是集货方（来自）；
  // - 管理员/未绑定单元/双方同属一个单元 → 没有「对方」，退回完整路径。
  const counterpartOf = (shipment: ShipmentListRow): { name: string; direction: 'out' | 'in' | null } => {
    const mine = me?.scopeUnitId ?? null;
    if (mine && shipment.shipperUnitId === mine && shipment.receiverUnitId !== mine) {
      return { name: shipment.receiverName ?? shipment.receiverUnitId, direction: 'out' };
    }
    if (mine && shipment.receiverUnitId === mine && shipment.shipperUnitId !== mine) {
      return { name: shipment.shipperName ?? shipment.shipperUnitId, direction: 'in' };
    }
    const shipper = shipment.shipperName ?? shipment.shipperUnitId;
    const receiver = shipment.receiverName ?? shipment.receiverUnitId;
    return { name: `${shipper} → ${receiver}`, direction: null };
  };

  const itemsQtyText = (shipment: ShipmentListRow): string => {
    const parts: string[] = [];
    if (typeof shipment.itemsCount === 'number') {
      parts.push(t('shipments.itemLines', { lines: shipment.itemsCount }));
    }
    const rawQty = shipment.totalQty;
    if (rawQty !== undefined && rawQty !== null && rawQty !== '') {
      const qty = Number(rawQty);
      if (Number.isFinite(qty)) {
        parts.push(t('shipments.qtyTotal', { qty: formatNumber(qty, locale) }));
      }
    }
    return parts.length > 0 ? parts.join(' · ') : '—';
  };

  const columns: DataTableColumn<ShipmentListRow>[] = [
    {
      id: 'shipmentNo',
      header: t('shipments.shipmentNo'),
      width: 152,
      minWidth: 110,
      // 主键列不给隐藏：单号是这张表的身份，关掉就没法认行了。
      hideable: false,
      sticky: true,
      cell: (shipment) => (
        <Link
          to={`/shipments/${shipment.id}`}
          // 行本身可点，链接自己拦截冒泡，避免同一个跳转触发两次
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-brand-700 hover:underline"
        >
          {shipment.shipmentNo}
        </Link>
      ),
    },
    {
      id: 'status',
      header: t('shipments.status'),
      width: 112,
      cell: (shipment) => (
        <Badge tone={STATUS_TONE[shipment.status]}>{t(`shipments.statuses.${shipment.status}`)}</Badge>
      ),
    },
    {
      id: 'counterparty',
      header: t('shipments.counterparty'),
      width: 220,
      minWidth: 140,
      cell: (shipment) => {
        const { name, direction } = counterpartOf(shipment);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate">{name}</span>
            {direction ? (
              <span className="text-[11px] text-ink-subtle">
                {direction === 'out' ? t('shipments.directionOut') : t('shipments.directionIn')}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'boxes',
      header: t('shipments.boxes'),
      width: 88,
      align: 'end',
      cell: (shipment) => <span className="tabular-nums">{formatNumber(shipment.boxesCount, locale)}</span>,
    },
    {
      id: 'itemsQty',
      header: t('shipments.itemsAndQty'),
      width: 140,
      align: 'end',
      cell: (shipment) => <span className="tabular-nums">{itemsQtyText(shipment)}</span>,
    },
    {
      id: 'createdAt',
      header: t('shipments.createdAt'),
      width: 168,
      cell: (shipment) => (
        <span className="tabular-nums text-ink-soft">{formatDateTime(shipment.createdAt, locale)}</span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('shipments.title')}
        // 首屏还没拿到数据时不显示「共 0 单」，避免把「未加载」读成「没有单」
        description={data ? t('shipments.total', { total }) : undefined}
        actions={
          canCreate ? (
            <Button asChild variant="primary">
              <Link to="/shipments/new">{t('shipments.newShipment')}</Link>
            </Button>
          ) : null
        }
      />

      <DataTable
        tableId="shipments"
        caption={t('shipments.title')}
        columns={columns}
        rows={rows}
        rowKey={(shipment) => shipment.id}
        total={total}
        loading={isLoading || (isFetching && rows.length === 0)}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<Truck aria-hidden />}
            title={filtered ? t('shipments.noMatch') : t('shipments.empty')}
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setStatus('');
                  }}
                >
                  {t('common.clearFilters')}
                </Button>
              ) : canCreate ? (
                <Button asChild variant="primary">
                  <Link to="/shipments/new">{t('shipments.newShipment')}</Link>
                </Button>
              ) : undefined
            }
          />
        }
        onRowClick={(shipment) => navigate(`/shipments/${shipment.id}`)}
        getRowLabel={(shipment) => `${shipment.shipmentNo} ${t(`shipments.statuses.${shipment.status}`)}`}
        rowActions={(shipment) => (
          // 行整体可点，菜单里的点击/回车不能冒泡成「打开详情」
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
                  aria-label={`${t('common.actions')} ${shipment.shipmentNo}`}
                >
                  <Ellipsis aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => navigate(`/shipments/${shipment.id}`)}>
                  {t('shipments.detail')}
                </DropdownMenuItem>
                {/* 转交后行与价格锁定（DRAFT → SENT），只有草稿可回表单编辑 */}
                {canCreate && shipment.status === 'DRAFT' ? (
                  <DropdownMenuItem onSelect={() => navigate(`/shipments/${shipment.id}/edit`)}>
                    <Pencil aria-hidden className="size-3.5" />
                    {t('shipments.edit')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        stickyFirstColumn
        maxHeight="calc(100dvh - 14rem)"
        toolbar={
          <FilterBar
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder={t('shipments.searchPlaceholder')}
            extra={
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as ShipmentStatus | '')}
                className="w-40"
                aria-label={t('shipments.status')}
              >
                <option value="">{t('shipments.allStatuses')}</option>
                {SHIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`shipments.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            }
            resultText={
              total > 0 ? (
                <span>{t('common.picker.count', { count: formatNumber(total, locale) })}</span>
              ) : null
            }
            right={<RefreshButton queryKey={['shipments', 'list']} />}
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
          />
        }
      />
    </div>
  );
}
