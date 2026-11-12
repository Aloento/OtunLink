import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Pencil, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Permissions,
  hasPermission,
  type RetailPriceDto,
  type RetailPriceHistoryDto,
} from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { listItems } from '../../api/items';
import { listPartnerships } from '../../api/partnerships';
import { listRetailPriceHistory, listRetailPrices, putRetailPrice } from '../../api/retail-prices';
import { listUnits } from '../../api/units';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { RefreshButton } from '../../components/RefreshButton';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { unitLabel } from '../../i18n/units';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Button } from '../../ui/button';
import { DataTable, TableCount, type DataTableColumn } from '../../ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Empty } from '../../ui/empty';
import { EntityPicker } from '../../ui/entity-picker';
import { Field } from '../../ui/field';
import { FilterBar } from '../../ui/filter-bar';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

const CURRENCIES = ['CNY', 'USD', 'EUR'] as const;

// 零售价管理：仓库 × 物品当前价 + 历史留痕；unit_cost 仅只读展示。
// 接口一次返回全部当前价（数据量 = 仓库 × 物品，远小于单据量），所以这里用客户端
// 排序 + 客户端关键词筛选是「真排序」，不会出现只排当前页的假象。
export function RetailPricesPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const queryClient = useQueryClient();

  const [unitId, setUnitId] = useState('');
  const [itemId, setItemId] = useState('');
  const [itemLabel, setItemLabel] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 200);
  const [draft, setDraft] = useState<{
    mode: 'edit' | 'create';
    id?: string;
    unitId: string;
    itemId: string;
    itemName: string | null;
    itemLabel?: string;
  } | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState<string>('CNY');
  const [historyOf, setHistoryOf] = useState<RetailPriceDto | null>(null);

  const { data: units } = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => listUnits(),
  });
  const partnershipsQuery = useQuery({
    queryKey: ['partnerships', 'list'],
    queryFn: () => listPartnerships(),
  });

  const isRetailer = me?.role === 'RETAILER';
  const warehouses = useMemo(() => {
    if (isRetailer) {
      return (partnershipsQuery.data?.items ?? []).map((p) => ({
        id: p.warehouseUnitId,
        name: p.warehouseUnitName ?? p.warehouseUnitId,
      }));
    }
    return (units ?? []).filter((u) => u.type === 'WAREHOUSE' && u.isActive);
  }, [isRetailer, partnershipsQuery.data, units]);

  const pricesQuery = useQuery({
    queryKey: ['retail-prices', 'list', unitId, itemId],
    queryFn: () => listRetailPrices({ unitId: unitId || undefined, itemId: itemId || undefined }),
  });

  const historyQuery = useQuery({
    queryKey: ['retail-prices', 'history', historyOf?.unitId, historyOf?.itemId],
    queryFn: () => listRetailPriceHistory(historyOf!.unitId, historyOf!.itemId),
    enabled: Boolean(historyOf),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      putRetailPrice({
        unitId: draft!.unitId,
        itemId: draft!.itemId,
        price: priceInput.trim(),
        currency: currencyInput,
      }),
    onSuccess: async () => {
      await refreshAfterWrite(queryClient);
      setDraft(null);
    },
  });

  const canWrite = hasPermission(me?.role, Permissions.RETAIL_PRICES_WRITE);

  const allRows = pricesQuery.data?.items ?? [];
  const rows = useMemo(() => {
    const keyword = debouncedQ.trim().toLowerCase();
    if (!keyword) return allRows;
    return allRows.filter((row) =>
      [row.unitName, row.itemName, row.currency, row.price]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [allRows, debouncedQ]);

  const openEdit = (row: RetailPriceDto) => {
    setDraft({
      mode: 'edit',
      id: row.id,
      unitId: row.unitId,
      itemId: row.itemId,
      itemName: row.itemName,
    });
    setPriceInput(row.price);
    setCurrencyInput(row.currency);
  };

  const openCreate = () => {
    setDraft({ mode: 'create', unitId, itemId, itemName: null });
    setPriceInput('');
    setCurrencyInput('CNY');
  };

  const canSave =
    Boolean(draft) &&
    Boolean(priceInput.trim()) &&
    (draft!.mode === 'edit' || (Boolean(draft!.unitId) && Boolean(draft!.itemId)));

  const columns: DataTableColumn<RetailPriceDto>[] = [
    {
      id: 'item',
      header: t('retailPrices.item'),
      width: 240,
      minWidth: 160,
      sticky: true,
      hideable: false,
      sortable: true,
      sortValue: (row) => row.itemName ?? row.itemId,
      cell: (row) => row.itemName ?? row.itemId,
    },
    {
      id: 'unit',
      header: t('retailPrices.unit'),
      width: 180,
      sortable: true,
      sortValue: (row) => row.unitName ?? row.unitId,
      cell: (row) => row.unitName ?? row.unitId,
    },
    {
      id: 'spec',
      header: t('retailPrices.spec'),
      width: 140,
      cell: (row) => unitLabel(t, row.spec, row.minSaleUnit),
    },
    {
      id: 'price',
      header: t('retailPrices.price'),
      width: 140,
      align: 'end',
      sortable: true,
      sortValue: (row) => Number(row.price),
      cell: (row) => `${row.currency} ${row.price}`,
    },
    {
      id: 'unitCost',
      header: t('retailPrices.unitCost'),
      width: 120,
      align: 'end',
      sortable: true,
      sortValue: (row) => (row.unitCost === null ? null : Number(row.unitCost)),
      cell: (row) => (row.unitCost === null ? '—' : row.unitCost),
    },
    {
      id: 'updatedByName',
      header: t('retailPrices.updatedByName'),
      width: 140,
      cell: (row) => row.updatedByName ?? row.updatedBy ?? '—',
    },
    {
      id: 'updatedAt',
      header: t('retailPrices.updatedAt'),
      width: 168,
      sortable: true,
      sortValue: (row) => row.updatedAt,
      cell: (row) => formatDateTime(row.updatedAt, locale),
    },
  ];

  const historyColumns: DataTableColumn<RetailPriceHistoryDto>[] = [
    {
      id: 'updatedAt',
      header: t('retailPrices.updatedAt'),
      width: 168,
      cell: (row) => formatDateTime(row.updatedAt, locale),
    },
    {
      id: 'price',
      header: t('retailPrices.price'),
      width: 140,
      align: 'end',
      cell: (row) => `${row.currency} ${row.price}`,
    },
    {
      id: 'updatedByName',
      header: t('retailPrices.updatedByName'),
      width: 140,
      cell: (row) => row.updatedByName ?? row.updatedBy ?? '—',
    },
  ];

  const errorMessage = saveMutation.isError
    ? isApiError(saveMutation.error)
      ? t(errorI18nKey(saveMutation.error.code))
      : t('errors.UNKNOWN')
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('retailPrices.title')}
        description={t('retailPrices.unitCostHint')}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={openCreate}>
              {t('retailPrices.add')}
            </Button>
          ) : undefined
        }
      />

      <DataTable
        tableId="retail-prices"
        caption={t('retailPrices.title')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        total={rows.length}
        loading={pricesQuery.isLoading}
        error={pricesQuery.isError ? t('errors.UNKNOWN') : undefined}
        empty={
          debouncedQ ? (
            <Empty
              icon={<Tags aria-hidden />}
              title={t('common.picker.empty')}
              description={t('common.picker.emptyHint')}
              action={
                <Button variant="secondary" onClick={() => setQ('')}>
                  {t('common.clearFilters')}
                </Button>
              }
            />
          ) : (
            <Empty icon={<Tags aria-hidden />} title={t('retailPrices.empty')} />
          )
        }
        getRowLabel={(row) => `${row.itemName ?? row.itemId} ${row.unitName ?? row.unitId}`}
        sortMode="client"
        initialSorting={[{ id: 'updatedAt', desc: true }]}
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              // 每行都有同名按钮：把物品名拼进可访问名称，否则读屏只听到一串无法区分的「历史」。
              aria-label={`${t('retailPrices.history')} ${row.itemName ?? row.itemId}`}
              icon={<History aria-hidden />}
              onClick={() => setHistoryOf(row)}
            >
              {t('retailPrices.history')}
            </Button>
            {canWrite && (
              <Button
                size="sm"
                variant="secondary"
                aria-label={`${t('retailPrices.edit')} ${row.itemName ?? row.itemId}`}
                icon={<Pencil aria-hidden />}
                onClick={() => openEdit(row)}
              >
                {t('retailPrices.edit')}
              </Button>
            )}
          </div>
        )}
        toolbar={
          <FilterBar
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder={t('retailPrices.searchPlaceholder')}
            extra={
              <>
                <Select
                  value={unitId}
                  onValueChange={setUnitId}
                  className="w-44"
                  aria-label={t('retailPrices.unit')}
                >
                  <option value="">{t('retailPrices.allUnits')}</option>
                  {warehouses.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <EntityPicker
                  value={itemId}
                  displayValue={itemLabel || undefined}
                  title={t('retailPrices.item')}
                  placeholder={t('retailPrices.allItems')}
                  aria-label={t('retailPrices.item')}
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
              </>
            }
            right={<RefreshButton queryKey={['retail-prices']} additionalKeys={[['units', 'list'], ['partnerships', 'list']]} />}
          />
        }
        footer={<TableCount total={rows.length} shown={rows.length} />}
      />

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        closeLabel={t('common.close')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draft?.mode === 'create' ? t('retailPrices.createTitle') : t('retailPrices.editTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {draft && (
              <div className="flex flex-col gap-3">
                {draft.mode === 'edit' ? (
                  <p className="text-sm text-ink-soft">
                    {warehouses.find((w) => w.id === draft.unitId)?.name ?? draft.unitId} ·{' '}
                    {draft.itemName ?? draft.itemId}
                  </p>
                ) : (
                  <>
                    <Field label={t('retailPrices.unit')} required>
                      <Select
                        value={draft.unitId}
                        onValueChange={(value) => setDraft((prev) => (prev ? { ...prev, unitId: value } : prev))}
                      >
                        <option value="">{t('retailPrices.selectUnit')}</option>
                        {warehouses.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('retailPrices.item')} required>
                      <EntityPicker
                        value={draft.itemId}
                        displayValue={draft.itemLabel}
                        title={t('retailPrices.item')}
                        placeholder={t('retailPrices.selectItem')}
                        aria-label={t('retailPrices.item')}
                        onSearch={async (keyword, pickerPage) => {
                          const result = await listItems({
                            q: keyword || undefined,
                            page: pickerPage,
                            size: 50,
                          });
                          return {
                            total: result.total,
                            items: result.items.map((item) => ({
                              id: item.id,
                              label: item.name,
                              meta: [item.sku, item.barcode].filter(Boolean).join(' · ') || undefined,
                            })),
                          };
                        }}
                        onChange={(option) =>
                          setDraft((prev) =>
                            prev ? { ...prev, itemId: option.id, itemName: option.label, itemLabel: option.label } : prev,
                          )
                        }
                      />
                    </Field>
                  </>
                )}
                <Field label={t('retailPrices.price')} required>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                  />
                </Field>
                <Field label={t('retailPrices.currency')}>
                  <Select value={currencyInput} onValueChange={setCurrencyInput}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                {errorMessage && (
                  <p role="alert" className="text-sm text-danger-600">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t('retailPrices.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              disabled={!canSave}
              onClick={() => saveMutation.mutate()}
            >
              {t('retailPrices.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyOf !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryOf(null);
        }}
        closeLabel={t('common.close')}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('retailPrices.historyTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {historyQuery.isLoading ? (
              <Spinner label={t('common.loading')} />
            ) : (
              <DataTable
                tableId="retail-price-history"
                caption={t('retailPrices.historyTitle')}
                columns={historyColumns}
                rows={historyQuery.data?.items ?? []}
                rowKey={(row) => row.id}
                total={historyQuery.data?.items.length ?? 0}
                empty={<Empty title={t('retailPrices.noHistory')} />}
                maxHeight="40vh"
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setHistoryOf(null)}>
              {t('retailPrices.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
