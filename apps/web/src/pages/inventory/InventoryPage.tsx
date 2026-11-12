import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Boxes, CalendarX, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  Permissions,
  expiryRemainingDays,
  hasPermission,
  type StockBatchDto,
  type StockMovementDto,
  type StockRowDto,
} from '@otunlink/shared';

import { listItems } from '../../api/items';
import { listPartnerships } from '../../api/partnerships';
import { listExpiredBatches, listStock, listStockMovements } from '../../api/stock';
import { listRetailPrices } from '../../api/retail-prices';
import { listUnits } from '../../api/units';
import { useSession } from '../../auth/SessionProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { unitLabel } from '../../i18n/units';
import { ItemLink } from '../../components/ItemLink';
import { RefreshButton } from '../../components/RefreshButton';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Button } from '../../ui/button';
import { DataTable, TableCount, TablePager, type DataTableColumn } from '../../ui/data-table';
import { Empty } from '../../ui/empty';
import { EntityPicker } from '../../ui/entity-picker';
import { FilterBar } from '../../ui/filter-bar';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

const DEFAULT_PAGE_SIZE = 20;

type View = 'stock' | 'movements' | 'expired';

/** 效期列着色：已过期红、≤30 天黄。颜色只是辅助，日期本身始终文本可读。 */
function expiryCell(expiryDate: string | null): ReactNode {
  if (!expiryDate) return <span className="text-ink-subtle">—</span>;
  const days = expiryRemainingDays(expiryDate);
  if (days !== null && days < 0) return <span className="font-medium text-danger-700">{expiryDate}</span>;
  if (days !== null && days <= 30) return <span className="font-medium text-warning-700">{expiryDate}</span>;
  return <span className="tabular-nums">{expiryDate}</span>;
}

// 库存台账：库存 / 流水 / 已过期批次三个视图。
// 三个视图都是服务端分页 + 服务端筛选（仓库、物品、关键词），表格只呈现当前页，
// 不在前端对「当前页」排序或过滤 —— 那会让用户以为自己在看全量。
export function InventoryPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 零售角色只读视图：库存 + 零售价（无成本字段）。
  const isRetailer = me?.role === 'RETAILER';

  const initialView: View = searchParams.get('tab') === 'expired' ? 'expired' : 'stock';
  const [view, setView] = useState<View>(initialView);
  const [unitId, setUnitId] = useState('');
  const [itemId, setItemId] = useState('');
  const [itemLabel, setItemLabel] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 任何筛选变化都回到第 1 页：否则会停在「第 7 页 / 共 1 页」的空表上。
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, unitId, itemId, pageSize, view]);

  const { data: units } = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => listUnits(),
  });

  const warehouses = useMemo(
    () => (units ?? []).filter((u) => u.type === 'WAREHOUSE' && u.isActive),
    [units],
  );

  // 零售：已签约仓库列表（用于仓库筛选与「已签约仓库」展示；服务端已按签约过滤数据）。
  const partnershipsQuery = useQuery({
    queryKey: ['partnerships', 'list'],
    queryFn: () => listPartnerships(),
    enabled: isRetailer,
  });
  const signedWarehouses = useMemo(
    () =>
      (partnershipsQuery.data?.items ?? []).map((p) => ({
        id: p.warehouseUnitId,
        name: p.warehouseUnitName ?? p.warehouseUnitId,
      })),
    [partnershipsQuery.data],
  );

  const query = {
    unitId: unitId || undefined,
    itemId: itemId || undefined,
    q: debouncedQ || undefined,
    page,
    size: pageSize,
  };

  const stockQuery = useQuery({
    queryKey: ['stock', 'list', unitId, itemId, debouncedQ, page, pageSize],
    queryFn: () => listStock(query),
    enabled: view === 'stock',
    placeholderData: keepPreviousData,
  });
  const movementsQuery = useQuery({
    queryKey: ['stock', 'movements', unitId, itemId, debouncedQ, page, pageSize],
    queryFn: () => listStockMovements(query),
    enabled: view === 'movements',
    placeholderData: keepPreviousData,
  });

  // 已过期批次视图（GET /stock/expired 必须指定仓库：优先筛选值，其次账号 scope，再退首个仓库）。
  // 零售账号的 scope 是门店而非仓库，故退首个已签约仓库。
  const effectiveUnitId =
    unitId || (isRetailer ? signedWarehouses[0]?.id : me?.scopeUnitId) || warehouses[0]?.id || '';
  const expiredQuery = useQuery({
    queryKey: ['stock', 'expired', effectiveUnitId, itemId],
    queryFn: () => listExpiredBatches({ unitId: effectiveUnitId, itemId: itemId || undefined }),
    enabled: view === 'expired' && Boolean(effectiveUnitId),
    placeholderData: keepPreviousData,
  });

  const retailPriceQuery = useQuery({
    queryKey: ['retail-prices', 'list', unitId || undefined],
    queryFn: () => listRetailPrices({ unitId: unitId || undefined }),
    enabled: isRetailer && view === 'stock',
  });
  const retailPriceOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const price of retailPriceQuery.data?.items ?? []) {
      map.set(`${price.unitId}:${price.itemId}`, `${price.price} ${price.currency}`);
    }
    return (unitIdValue: string, itemIdValue: string) => map.get(`${unitIdValue}:${itemIdValue}`) ?? '—';
  }, [retailPriceQuery.data]);

  const canWriteStock = hasPermission(me?.role, Permissions.STOCK_WRITE);
  const canReadRetailPrices = hasPermission(me?.role, Permissions.RETAIL_PRICES_READ);
  const filtered = Boolean(debouncedQ || unitId || itemId);

  const stockTotal = stockQuery.data?.total ?? 0;
  const movementsTotal = movementsQuery.data?.total ?? 0;
  const expiredRows = expiredQuery.data?.items ?? [];

  /** 一键报损：预填全部过期批次（数量可在报损单中调整）。 */
  const handleCreateLossOrder = (rows: StockBatchDto[]) => {
    const prefill = rows.map((r) => ({ itemId: r.itemId, qty: String(r.qty), batchId: r.batchId }));
    const params = new URLSearchParams({
      type: 'LOSS',
      warehouseUnitId: effectiveUnitId,
      reason: t('inventory.expiredReason'),
      prefill: JSON.stringify(prefill),
    });
    navigate(`/outbound/new?${params.toString()}`);
  };

  const clearFilters = () => {
    setQ('');
    setUnitId('');
    setItemId('');
    setItemLabel('');
  };

  const stockColumns: DataTableColumn<StockRowDto>[] = [
    {
      id: 'item',
      header: t('inventory.item'),
      width: 240,
      minWidth: 160,
      sticky: true,
      hideable: false,
      cell: (row) => <ItemLink itemId={row.itemId} itemName={row.itemName} />,
    },
    { id: 'unit', header: t('inventory.unit'), width: 160, cell: (row) => row.unitName ?? row.unitId },
    { id: 'spec', header: t('inventory.spec'), width: 140, cell: (row) => unitLabel(t, row.spec, row.minSaleUnit) },
    { id: 'batchNo', header: t('inventory.batchNo'), width: 140, cell: (row) => row.batchNo ?? '—' },
    { id: 'expiry', header: t('inventory.expiry'), width: 112, cell: (row) => expiryCell(row.expiryDate) },
    { id: 'qty', header: t('inventory.qty'), width: 96, align: 'end', cell: (row) => row.qty },
    ...(isRetailer
      ? ([
          {
            id: 'retailPrice',
            header: t('inventory.retailPrice'),
            width: 120,
            align: 'end',
            cell: (row: StockRowDto) => retailPriceOf(row.unitId, row.itemId),
          },
        ] satisfies DataTableColumn<StockRowDto>[])
      : ([
          {
            id: 'avgCost',
            header: t('inventory.avgCost'),
            width: 112,
            align: 'end',
            cell: (row: StockRowDto) => row.avgCost,
          },
        ] satisfies DataTableColumn<StockRowDto>[])),
    {
      id: 'available',
      header: t('inventory.available'),
      width: 104,
      align: 'end',
      cell: (row) => row.availableQty,
    },
  ];

  const movementColumns: DataTableColumn<StockMovementDto>[] = [
    {
      id: 'createdAt',
      header: t('inventory.createdAt'),
      width: 168,
      cell: (row) => (row.createdAt ? formatDateTime(row.createdAt, locale) : '—'),
    },
    {
      id: 'type',
      header: t('inventory.moveType'),
      width: 120,
      cell: (row) => t(`inventory.moveTypes.${row.type}`),
    },
    {
      id: 'item',
      header: t('inventory.item'),
      width: 240,
      minWidth: 160,
      sticky: true,
      hideable: false,
      cell: (row) => <ItemLink itemId={row.itemId} itemName={row.itemName} />,
    },
    { id: 'batchNo', header: t('inventory.batchNo'), width: 140, cell: (row) => row.batchNo ?? '—' },
    { id: 'delta', header: t('inventory.delta'), width: 96, align: 'end', cell: (row) => row.qtyDelta },
    { id: 'after', header: t('inventory.after'), width: 96, align: 'end', cell: (row) => row.qtyAfter },
    { id: 'refNo', header: t('inventory.refNo'), width: 160, cell: (row) => row.refNo ?? '—' },
  ];

  const expiredColumns: DataTableColumn<StockBatchDto>[] = [
    {
      id: 'item',
      header: t('inventory.item'),
      width: 240,
      minWidth: 160,
      sticky: true,
      hideable: false,
      cell: (row) => <ItemLink itemId={row.itemId} itemName={row.itemName} />,
    },
    { id: 'unit', header: t('inventory.unit'), width: 160, cell: (row) => row.unitName ?? row.unitId },
    { id: 'batchNo', header: t('inventory.batchNo'), width: 140, cell: (row) => row.batchNo ?? '—' },
    { id: 'expiry', header: t('inventory.expiry'), width: 112, cell: (row) => expiryCell(row.expiryDate) },
    {
      id: 'remainingDays',
      header: t('inventory.remainingDays'),
      width: 112,
      align: 'end',
      cell: (row) =>
        row.remainingDays === null ? '—' : t('inventory.remainingDaysValue', { days: row.remainingDays }),
    },
    { id: 'qty', header: t('inventory.qty'), width: 96, align: 'end', cell: (row) => row.qty },
  ];

  // 物品筛选走模态选择器（服务端搜索），不用 <Select>：物品动辄上千条，
  // 下拉里只能塞下已经加载的前 100 条，用户会因为「搜不到」而以为数据丢了。
  const itemFilter = (
    <div className="flex items-center gap-1">
      <EntityPicker
        value={itemId}
        displayValue={itemLabel || undefined}
        title={t('inventory.item')}
        placeholder={t('inventory.allItems')}
        aria-label={t('inventory.item')}
        className="w-48"
        onSearch={async (keyword, pickerPage) => {
          const result = await listItems({ q: keyword || undefined, page: pickerPage, size: 50 });
          return {
            total: result.total,
            items: result.items.map((item) => ({
              id: item.id,
              label: item.name,
              meta: [item.sku, item.barcode].filter(Boolean).join(' · ') || undefined,
            })),
          };
        }}
        onChange={(option) => {
          setItemId(option.id);
          setItemLabel(option.label);
        }}
      />
      {itemId ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('inventory.clearItem')}
          onClick={() => {
            setItemId('');
            setItemLabel('');
          }}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );

  const unitFilter = (
    <Select value={unitId} onValueChange={setUnitId} className="w-44" aria-label={t('inventory.unit')}>
      <option value="">{t('inventory.allUnits')}</option>
      {(isRetailer ? signedWarehouses : warehouses).map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </Select>
  );

  const toolbar = (refreshKeys: string[], right?: ReactNode) => (
    <FilterBar
      searchValue={q}
      onSearchChange={setQ}
      searchPlaceholder={t('inventory.searchPlaceholder')}
      extra={
        <>
          {unitFilter}
          {itemFilter}
        </>
      }
      right={
        <>
          {right}
          <RefreshButton queryKey={refreshKeys} />
        </>
      }
    />
  );

  const emptyState = (icon: ReactNode, title: string) =>
    filtered ? (
      <Empty
        icon={icon}
        title={t('inventory.noMatch')}
        description={t('common.picker.emptyHint')}
        action={
          <Button variant="secondary" onClick={clearFilters}>
            {t('common.clearFilters')}
          </Button>
        }
      />
    ) : (
      <Empty icon={icon} title={title} />
    );

  return (
    <Tabs value={view} onValueChange={(next) => setView(next as View)} className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('inventory.title')}
        description={
          isRetailer
            ? `${t('inventory.signedWarehouses')}: ${
                signedWarehouses.length > 0
                  ? signedWarehouses.map((w) => w.name).join('、')
                  : t('inventory.noSignedWarehouses')
              }`
            : undefined
        }
        actions={
          <>
            <TabsList aria-label={t('inventory.title')}>
              <TabsTrigger value="stock">{t('inventory.tabStock')}</TabsTrigger>
              <TabsTrigger value="movements">{t('inventory.tabMovements')}</TabsTrigger>
              <TabsTrigger value="expired">{t('inventory.tabExpired')}</TabsTrigger>
            </TabsList>
            {canReadRetailPrices && (
              <Button asChild variant="secondary">
                <Link to="/retail-prices">{t('retailPrices.title')}</Link>
              </Button>
            )}
          </>
        }
      />

      <TabsContent value="stock">
        <DataTable
          tableId="inventory-stock"
          caption={t('inventory.tabStock')}
          columns={stockColumns}
          rows={stockQuery.data?.items ?? []}
          rowKey={(row) => row.batchId}
          total={stockTotal}
          loading={stockQuery.isLoading}
          error={stockQuery.isError ? t('errors.UNKNOWN') : undefined}
          empty={emptyState(<Boxes aria-hidden />, t('inventory.empty'))}
          getRowLabel={(row) => `${row.itemName ?? row.itemId} ${row.unitName ?? row.unitId}`}
          stickyFirstColumn
          maxHeight="calc(100dvh - 15rem)"
          toolbar={toolbar(['stock', 'list'])}
          footer={
            <TablePager
              page={page}
              totalPages={Math.max(1, Math.ceil(stockTotal / pageSize))}
              total={stockTotal}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              // 服务端 size 上限 50：给出 100 会让「第 x–y 条」与实际返回行数错位。
              pageSizeOptions={[20, 50]}
            />
          }
        />
      </TabsContent>

      <TabsContent value="movements">
        <DataTable
          tableId="inventory-movements"
          caption={t('inventory.tabMovements')}
          columns={movementColumns}
          rows={movementsQuery.data?.items ?? []}
          rowKey={(row) => row.id}
          total={movementsTotal}
          loading={movementsQuery.isLoading}
          error={movementsQuery.isError ? t('errors.UNKNOWN') : undefined}
          empty={emptyState(<ArrowLeftRight aria-hidden />, t('inventory.noMovements'))}
          getRowLabel={(row) => `${row.itemName ?? row.itemId} ${t(`inventory.moveTypes.${row.type}`)}`}
          stickyFirstColumn
          maxHeight="calc(100dvh - 15rem)"
          toolbar={toolbar(['stock', 'movements'])}
          footer={
            <TablePager
              page={page}
              totalPages={Math.max(1, Math.ceil(movementsTotal / pageSize))}
              total={movementsTotal}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[20, 50]}
            />
          }
        />
      </TabsContent>

      <TabsContent value="expired">
        <DataTable
          tableId="inventory-expired"
          caption={t('inventory.tabExpired')}
          columns={expiredColumns}
          rows={effectiveUnitId ? expiredRows : []}
          rowKey={(row) => row.batchId}
          total={expiredRows.length}
          loading={expiredQuery.isLoading}
          error={expiredQuery.isError ? t('errors.UNKNOWN') : undefined}
          empty={
            effectiveUnitId ? (
              <Empty icon={<CalendarX aria-hidden />} title={t('inventory.noExpired')} />
            ) : (
              <Empty
                icon={<AlertTriangle aria-hidden />}
                title={t('inventory.expiredNeedUnit')}
              />
            )
          }
          getRowLabel={(row) => `${row.itemName ?? row.itemId} ${row.batchNo ?? row.batchId}`}
          stickyFirstColumn
          maxHeight="calc(100dvh - 15rem)"
          toolbar={toolbar(
            ['stock', 'expired'],
            canWriteStock && expiredRows.length > 0 && effectiveUnitId ? (
              <Button variant="primary" onClick={() => handleCreateLossOrder(expiredRows)}>
                {t('inventory.createLossFromExpired')}
              </Button>
            ) : null,
          )}
          footer={<TableCount total={expiredRows.length} shown={expiredRows.length} />}
        />
      </TabsContent>
    </Tabs>
  );
}
