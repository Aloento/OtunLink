import { Button, Select, Spinner, Tab, TabList, Text, Title1 } from '@fluentui/react-components';
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
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

type View = 'stock' | 'movements' | 'expired';

/** 效期列着色：已过期红、≤30 天黄。 */
function expiryCell(expiryDate: string | null): ReactNode {
  if (!expiryDate) return '—';
  const days = expiryRemainingDays(expiryDate);
  if (days !== null && days < 0) return <span className="font-medium text-red-600">{expiryDate}</span>;
  if (days !== null && days <= 30) return <span className="font-medium text-amber-600">{expiryDate}</span>;
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
    staleTime: 60_000,
  });
  const { data: itemPage } = useQuery({
    queryKey: ['items', 'picker', ''],
    queryFn: () => listItems({ size: 100 }),
    staleTime: 30_000,
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
    staleTime: 60_000,
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
    staleTime: 30_000,
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
    { key: 'item', header: t('inventory.item'), render: (row) => row.itemName ?? row.itemId },
    { key: 'spec', header: t('inventory.spec'), render: (row) => row.spec ?? '—' },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    { key: 'expiry', header: t('inventory.expiry'), render: (row) => expiryCell(row.expiryDate) },
    { key: 'qty', header: t('inventory.qty'), render: (row) => row.qty },
    ...(isRetailer
      ? ([{ key: 'retailPrice', header: t('inventory.retailPrice'), render: (row: StockRowDto) => retailPriceOf(row.unitId, row.itemId) }] as ResponsiveTableColumn<StockRowDto>[])
      : ([{ key: 'avgCost', header: t('inventory.avgCost'), render: (row: StockRowDto) => row.avgCost }] as ResponsiveTableColumn<StockRowDto>[])),
    { key: 'available', header: t('inventory.available'), render: (row) => row.availableQty },
  ];

  const expiredColumns: ResponsiveTableColumn<StockBatchDto>[] = [
    { key: 'unit', header: t('inventory.unit'), render: (row) => row.unitName ?? row.unitId },
    { key: 'item', header: t('inventory.item'), render: (row) => row.itemName ?? row.itemId },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    { key: 'expiry', header: t('inventory.expiry'), render: (row) => expiryCell(row.expiryDate) },
    {
      key: 'remainingDays',
      header: t('inventory.remainingDays'),
      render: (row) =>
        row.remainingDays === null ? '—' : t('inventory.remainingDaysValue', { days: row.remainingDays }),
    },
    { key: 'qty', header: t('inventory.qty'), render: (row) => row.qty },
  ];

  const movementColumns: ResponsiveTableColumn<StockMovementDto>[] = [
    {
      key: 'createdAt',
      header: t('inventory.createdAt'),
      render: (row) => (row.createdAt ? formatDateTime(row.createdAt, locale) : '—'),
    },
    { key: 'type', header: t('inventory.moveType'), render: (row) => t(`inventory.moveTypes.${row.type}`) },
    { key: 'item', header: t('inventory.item'), render: (row) => row.itemName ?? row.itemId },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    { key: 'delta', header: t('inventory.delta'), render: (row) => row.qtyDelta },
    { key: 'after', header: t('inventory.after'), render: (row) => row.qtyAfter },
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('inventory.title')}</Title1>
        <div className="flex items-center gap-2">
          {canReadRetailPrices && (
            <Link to="/retail-prices">
              <Button appearance="secondary">{t('retailPrices.title')}</Button>
            </Link>
          )}
          <TabList selectedValue={view} onTabSelect={(_, d) => setView(d.value as View)}>
            <Tab value="stock">{t('inventory.tabStock')}</Tab>
            <Tab value="movements">{t('inventory.tabMovements')}</Tab>
            <Tab value="expired">{t('inventory.tabExpired')}</Tab>
          </TabList>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={unitId}
          onChange={(_, d) => {
            setUnitId(d.value);
            setPage(1);
          }}
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
          onChange={(_, d) => {
            setItemId(d.value);
            setPage(1);
          }}
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
        <Text size={200} className="text-neutral-500">
          {t('inventory.signedWarehouses')}:{' '}
          {signedWarehouses.length > 0
            ? signedWarehouses.map((w) => w.name).join('、')
            : t('inventory.noSignedWarehouses')}
        </Text>
      )}

      {activeQuery.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : activeQuery.isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : view === 'expired' ? (
        <>
          {!effectiveUnitId && <Text className="text-amber-600">{t('inventory.expiredNeedUnit')}</Text>}
          {canWriteStock && (expiredQuery.data?.items.length ?? 0) > 0 && (
            <div>
              <Button
                appearance="primary"
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
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('inventory.total', { total })}</span>
          </div>
        </>
      ) : (
        <>
          {view === 'stock' ? (
            <ResponsiveTable
              columns={stockColumns}
              items={stockQuery.data?.items ?? []}
              rowKey={(row) => row.batchId}
              emptyText={t('inventory.empty')}
            />
          ) : (
            <ResponsiveTable
              columns={movementColumns}
              items={movementsQuery.data?.items ?? []}
              rowKey={(row) => row.id}
              emptyText={t('inventory.noMovements')}
            />
          )}
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('inventory.total', { total })}</span>
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
