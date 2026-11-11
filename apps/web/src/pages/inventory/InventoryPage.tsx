import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
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
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

const PAGE_SIZE = 20;

type View = 'stock' | 'movements' | 'expired';

/** 效期列着色：已过期红、≤30 天黄。 */
function expiryCell(expiryDate: string | null): ReactNode {
  if (!expiryDate) return '—';
  const days = expiryRemainingDays(expiryDate);
  if (days !== null && days < 0) return <span className="font-medium text-danger-600">{expiryDate}</span>;
  if (days !== null && days <= 30) return <span className="font-medium text-warning-700">{expiryDate}</span>;
  return expiryDate;
}

// 库存台账：库存 / 流水 / 已过期批次视图 + 一键报损 + 零售价入口。
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
  const [page, setPage] = useState(1);

  const { data: units } = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => listUnits(),
  });
  const { data: itemPage } = useQuery({
    queryKey: ['items', 'picker', ''],
    queryFn: () => listItems({ size: 100 }),
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
    page,
    size: PAGE_SIZE,
  };

  const stockQuery = useQuery({
    queryKey: ['stock', 'list', unitId, itemId, page],
    queryFn: () => listStock(query),
    enabled: view === 'stock',
    placeholderData: keepPreviousData,
  });
  const movementsQuery = useQuery({
    queryKey: ['stock', 'movements', unitId, itemId, page],
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

  const activeQuery = view === 'stock' ? stockQuery : view === 'movements' ? movementsQuery : expiredQuery;

  const stockColumns: ResponsiveTableColumn<StockRowDto>[] = [
    { key: 'unit', header: t('inventory.unit'), render: (row) => row.unitName ?? row.unitId },
    {
      key: 'item',
      header: t('inventory.item'),
      render: (row) => <ItemLink itemId={row.itemId} itemName={row.itemName} />,
    },
    { key: 'spec', header: t('inventory.spec'), render: (row) => unitLabel(t, row.spec, row.minSaleUnit) },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    { key: 'expiry', header: t('inventory.expiry'), render: (row) => expiryCell(row.expiryDate) },
    {
      key: 'qty',
      header: t('inventory.qty'),
      // 数量右对齐 + 等宽数字：逐行比对个位时不用左右找基准。
      render: (row) => <span className="block text-end tabular-nums">{row.qty}</span>,
    },
    ...(isRetailer
      ? ([{ key: 'retailPrice', header: t('inventory.retailPrice'), render: (row: StockRowDto) => <span className="block text-end tabular-nums">{retailPriceOf(row.unitId, row.itemId)}</span> }] as ResponsiveTableColumn<StockRowDto>[])
      : ([{ key: 'avgCost', header: t('inventory.avgCost'), render: (row: StockRowDto) => <span className="block text-end tabular-nums">{row.avgCost}</span> }] as ResponsiveTableColumn<StockRowDto>[])),
    {
      key: 'available',
      header: t('inventory.available'),
      render: (row) => <span className="block text-end tabular-nums">{row.availableQty}</span>,
    },
  ];

  const expiredColumns: ResponsiveTableColumn<StockBatchDto>[] = [
    { key: 'unit', header: t('inventory.unit'), render: (row) => row.unitName ?? row.unitId },
    {
      key: 'item',
      header: t('inventory.item'),
      render: (row) => <ItemLink itemId={row.itemId} itemName={row.itemName} />,
    },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    { key: 'expiry', header: t('inventory.expiry'), render: (row) => expiryCell(row.expiryDate) },
    {
      key: 'remainingDays',
      header: t('inventory.remainingDays'),
      render: (row) =>
        row.remainingDays === null ? '—' : t('inventory.remainingDaysValue', { days: row.remainingDays }),
    },
    {
      key: 'qty',
      header: t('inventory.qty'),
      render: (row) => <span className="block text-end tabular-nums">{row.qty}</span>,
    },
  ];

  const movementColumns: ResponsiveTableColumn<StockMovementDto>[] = [
    {
      key: 'createdAt',
      header: t('inventory.createdAt'),
      render: (row) => (row.createdAt ? formatDateTime(row.createdAt, locale) : '—'),
    },
    { key: 'type', header: t('inventory.moveType'), render: (row) => t(`inventory.moveTypes.${row.type}`) },
    {
      key: 'item',
      header: t('inventory.item'),
      render: (row) => <ItemLink itemId={row.itemId} itemName={row.itemName} />,
    },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    {
      key: 'delta',
      header: t('inventory.delta'),
      render: (row) => <span className="block text-end tabular-nums">{row.qtyDelta}</span>,
    },
    {
      key: 'after',
      header: t('inventory.after'),
      render: (row) => <span className="block text-end tabular-nums">{row.qtyAfter}</span>,
    },
    { key: 'refNo', header: t('inventory.refNo'), render: (row) => row.refNo ?? '—' },
  ];

  const total =
    view === 'expired'
      ? (expiredQuery.data?.items ?? []).length
      : ((view === 'stock' ? stockQuery.data?.total : movementsQuery.data?.total) ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canWriteStock = hasPermission(me?.role, Permissions.STOCK_WRITE);
  const canReadRetailPrices = hasPermission(me?.role, Permissions.RETAIL_PRICES_READ);

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

  // 三个面板共用同一段渲染：Tabs 只挂载当前面板，activeQuery 已按 view 取好。
  const renderPanel = () => {
    if (activeQuery.isLoading) return <Spinner label={t('common.loading')} />;
    if (activeQuery.isError) {
      return (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      );
    }

    if (view === 'expired') {
      return (
        <>
          {!effectiveUnitId && (
            <p role="status" className="text-sm text-warning-700">
              {t('inventory.expiredNeedUnit')}
            </p>
          )}
          {canWriteStock && (expiredQuery.data?.items.length ?? 0) > 0 && (
            <div>
              <Button
                variant="primary"
                onClick={() => handleCreateLossOrder(expiredQuery.data?.items ?? [])}
              >
                {t('inventory.createLossFromExpired')}
              </Button>
            </div>
          )}
          <ResponsiveTable
            columns={expiredColumns}
            items={expiredQuery.data?.items ?? []}
            rowKey={(row) => row.batchId}
            emptyText={t('inventory.noExpired')}
            label={t('inventory.tabExpired')}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span>{t('inventory.total', { total })}</span>
          </div>
        </>
      );
    }

    return (
      <>
        {view === 'stock' ? (
          <ResponsiveTable
            columns={stockColumns}
            items={stockQuery.data?.items ?? []}
            rowKey={(row) => row.batchId}
            emptyText={t('inventory.empty')}
            label={t('inventory.tabStock')}
          />
        ) : (
          <ResponsiveTable
            columns={movementColumns}
            items={movementsQuery.data?.items ?? []}
            rowKey={(row) => row.id}
            emptyText={t('inventory.noMovements')}
            label={t('inventory.tabMovements')}
          />
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          totalLabel={t('inventory.total', { total })}
        />
      </>
    );
  };

  return (
    <Tabs
      value={view}
      onValueChange={(next) => setView(next as View)}
      className="flex flex-col gap-4"
    >
      <PageHeader
        title={t('inventory.title')}
        actions={
          <>
            <RefreshButton
              queryKey={view === 'stock' ? ['stock', 'list'] : view === 'movements' ? ['stock', 'movements'] : ['stock', 'expired']}
            />
            {canReadRetailPrices && (
              <Button asChild variant="secondary">
                <Link to="/retail-prices">{t('retailPrices.title')}</Link>
              </Button>
            )}
            <TabsList aria-label={t('inventory.title')}>
              <TabsTrigger value="stock">{t('inventory.tabStock')}</TabsTrigger>
              <TabsTrigger value="movements">{t('inventory.tabMovements')}</TabsTrigger>
              <TabsTrigger value="expired">{t('inventory.tabExpired')}</TabsTrigger>
            </TabsList>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={unitId}
          onValueChange={(value) => {
            setUnitId(value);
            setPage(1);
          }}
          className="w-full sm:w-56"
          aria-label={t('inventory.unit')}
        >
          <option value="">{t('inventory.allUnits')}</option>
          {(isRetailer ? signedWarehouses : warehouses).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          value={itemId}
          onValueChange={(value) => {
            setItemId(value);
            setPage(1);
          }}
          className="w-full sm:w-56"
          aria-label={t('inventory.item')}
        >
          <option value="">{t('inventory.allItems')}</option>
          {(itemPage?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>

      {isRetailer && (
        <p className="text-xs text-ink-subtle">
          {t('inventory.signedWarehouses')}:{' '}
          {signedWarehouses.length > 0
            ? signedWarehouses.map((w) => w.name).join('、')
            : t('inventory.noSignedWarehouses')}
        </p>
      )}

      <TabsContent value="stock">{renderPanel()}</TabsContent>
      <TabsContent value="movements">{renderPanel()}</TabsContent>
      <TabsContent value="expired">{renderPanel()}</TabsContent>
    </Tabs>
  );
}
