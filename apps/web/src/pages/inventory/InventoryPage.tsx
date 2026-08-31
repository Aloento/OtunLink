import { Button, Select, Spinner, Tab, TabList, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { StockMovementDto, StockRowDto } from '@otunlink/shared';

import { listItems } from '../../api/items';
import { listStock, listStockMovements } from '../../api/stock';
import { listUnits } from '../../api/units';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

type View = 'stock' | 'movements';

// 库存台账（ck-08a §4.3）：仓库 × 物品 × 批次维度只读列表 + 只增不改删的流水。
export function InventoryPage() {
  const { t } = useTranslation();

  const [view, setView] = useState<View>('stock');
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

  const activeQuery = view === 'stock' ? stockQuery : movementsQuery;

  const stockColumns: ResponsiveTableColumn<StockRowDto>[] = [
    { key: 'unit', header: t('inventory.unit'), render: (row) => row.unitName ?? row.unitId },
    { key: 'item', header: t('inventory.item'), render: (row) => row.itemName ?? row.itemId },
    { key: 'spec', header: t('inventory.spec'), render: (row) => row.spec ?? '—' },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    { key: 'expiry', header: t('inventory.expiry'), render: (row) => row.expiryDate ?? '—' },
    { key: 'qty', header: t('inventory.qty'), render: (row) => row.qty },
    { key: 'avgCost', header: t('inventory.avgCost'), render: (row) => row.avgCost },
    { key: 'available', header: t('inventory.available'), render: (row) => row.availableQty },
  ];

  const movementColumns: ResponsiveTableColumn<StockMovementDto>[] = [
    { key: 'createdAt', header: t('inventory.createdAt'), render: (row) => row.createdAt },
    { key: 'type', header: t('inventory.moveType'), render: (row) => t(`inventory.moveTypes.${row.type}`) },
    { key: 'item', header: t('inventory.item'), render: (row) => row.itemName ?? row.itemId },
    { key: 'batchNo', header: t('inventory.batchNo'), render: (row) => row.batchNo ?? '—' },
    { key: 'delta', header: t('inventory.delta'), render: (row) => row.qtyDelta },
    { key: 'after', header: t('inventory.after'), render: (row) => row.qtyAfter },
    { key: 'refNo', header: t('inventory.refNo'), render: (row) => row.refNo ?? '—' },
  ];

  const total = (view === 'stock' ? stockQuery.data?.total : movementsQuery.data?.total) ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('inventory.title')}</Title1>
        <TabList selectedValue={view} onTabSelect={(_, d) => setView(d.value as View)}>
          <Tab value="stock">{t('inventory.tabStock')}</Tab>
          <Tab value="movements">{t('inventory.tabMovements')}</Tab>
        </TabList>
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
          {warehouses.map((u) => (
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

      {activeQuery.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : activeQuery.isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
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
