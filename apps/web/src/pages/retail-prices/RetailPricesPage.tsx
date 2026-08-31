import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Select,
  Spinner,
  Text,
  Title1,
} from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { listRetailPriceHistory, listRetailPrices, putRetailPrice } from '../../api/retail-prices';
import { listUnits } from '../../api/units';
import { useSession } from '../../auth/SessionProvider';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const CURRENCIES = ['CNY', 'USD', 'EUR'] as const;

// 零售价管理（ck-08b §4.2）：仓库 × 物品当前价 + 历史留痕；unit_cost 仅只读展示。
export function RetailPricesPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const queryClient = useQueryClient();

  const [unitId, setUnitId] = useState('');
  const [itemId, setItemId] = useState('');
  const [draft, setDraft] = useState<{
    mode: 'edit' | 'create';
    id?: string;
    unitId: string;
    itemId: string;
    unitName: string | null;
    itemName: string | null;
  } | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState<string>('CNY');
  const [historyOf, setHistoryOf] = useState<RetailPriceDto | null>(null);

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
      await queryClient.invalidateQueries({ queryKey: ['retail-prices'] });
      setDraft(null);
    },
  });

  const canWrite = hasPermission(me?.role, Permissions.RETAIL_PRICES_WRITE);

  const openEdit = (row: RetailPriceDto) => {
    setDraft({
      mode: 'edit',
      id: row.id,
      unitId: row.unitId,
      itemId: row.itemId,
      unitName: row.unitName,
      itemName: row.itemName,
    });
    setPriceInput(row.price);
    setCurrencyInput(row.currency);
  };

  const openCreate = () => {
    setDraft({
      mode: 'create',
      unitId: unitId || '',
      itemId: itemId || '',
      unitName: null,
      itemName: null,
    });
    setPriceInput('');
    setCurrencyInput('CNY');
  };

  const canSave =
    Boolean(draft) &&
    Boolean(priceInput.trim()) &&
    (draft!.mode === 'edit' || (Boolean(draft!.unitId) && Boolean(draft!.itemId)));

  const columns: ResponsiveTableColumn<RetailPriceDto>[] = [
    { key: 'unit', header: t('retailPrices.unit'), render: (row) => row.unitName ?? row.unitId },
    { key: 'item', header: t('retailPrices.item'), render: (row) => row.itemName ?? row.itemId },
    { key: 'spec', header: t('retailPrices.spec'), render: (row) => row.spec ?? '—' },
    {
      key: 'price',
      header: t('retailPrices.price'),
      render: (row) => `${row.currency} ${row.price}`,
    },
    {
      key: 'unitCost',
      header: t('retailPrices.unitCost'),
      render: (row) => (row.unitCost === null ? '—' : row.unitCost),
    },
    {
      key: 'updatedByName',
      header: t('retailPrices.updatedByName'),
      render: (row) => row.updatedByName ?? row.updatedBy ?? '—',
    },
    { key: 'updatedAt', header: t('retailPrices.updatedAt'), render: (row) => row.updatedAt },
  ];

  const historyColumns: ResponsiveTableColumn<RetailPriceHistoryDto>[] = [
    { key: 'updatedAt', header: t('retailPrices.updatedAt'), render: (row) => row.updatedAt },
    {
      key: 'price',
      header: t('retailPrices.price'),
      render: (row) => `${row.currency} ${row.price}`,
    },
    {
      key: 'updatedByName',
      header: t('retailPrices.updatedByName'),
      render: (row) => row.updatedByName ?? row.updatedBy ?? '—',
    },
  ];

  const errorMessage = saveMutation.isError
    ? isApiError(saveMutation.error)
      ? t(errorI18nKey(saveMutation.error.code))
      : t('errors.UNKNOWN')
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('retailPrices.title')}</Title1>
        <div className="flex items-center gap-2">
          <Text size={200} className="text-neutral-500">
            {t('retailPrices.unitCostHint')}
          </Text>
          {canWrite && (
            <Button appearance="primary" onClick={openCreate}>
              {t('retailPrices.add')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={unitId} onChange={(_, d) => setUnitId(d.value)} aria-label={t('retailPrices.unit')}>
          <option value="">{t('retailPrices.allUnits')}</option>
          {warehouses.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select value={itemId} onChange={(_, d) => setItemId(d.value)} aria-label={t('retailPrices.item')}>
          <option value="">{t('retailPrices.allItems')}</option>
          {(itemPage?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>

      {pricesQuery.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : pricesQuery.isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <ResponsiveTable
          columns={columns}
          items={pricesQuery.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyText={t('retailPrices.empty')}
          actions={(row) => (
            <div className="flex items-center gap-2">
              <Button size="small" appearance="secondary" onClick={() => setHistoryOf(row)}>
                {t('retailPrices.history')}
              </Button>
              {canWrite && (
                <Button size="small" appearance="primary" onClick={() => openEdit(row)}>
                  {t('retailPrices.edit')}
                </Button>
              )}
            </div>
          )}
        />
      )}

      <Dialog open={draft !== null} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {draft?.mode === 'create' ? t('retailPrices.createTitle') : t('retailPrices.editTitle')}
            </DialogTitle>
            <DialogContent>
              {draft && (
                <div className="flex flex-col gap-3">
                  {draft.mode === 'edit' ? (
                    <Text>
                      {draft.unitName ?? draft.unitId} · {draft.itemName ?? draft.itemId}
                    </Text>
                  ) : (
                    <>
                      <Field label={t('retailPrices.unit')} required>
                        <Select
                          value={draft.unitId}
                          onChange={(_, d) =>
                            setDraft((prev) => (prev ? { ...prev, unitId: d.value, unitName: null } : prev))
                          }
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
                        <Select
                          value={draft.itemId}
                          onChange={(_, d) =>
                            setDraft((prev) => (prev ? { ...prev, itemId: d.value, itemName: null } : prev))
                          }
                        >
                          <option value="">{t('retailPrices.selectItem')}</option>
                          {(itemPage?.items ?? []).map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </>
                  )}
                  <Field label={t('retailPrices.price')} required>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={priceInput}
                      onChange={(_, d) => setPriceInput(d.value)}
                    />
                  </Field>
                  <Field label={t('retailPrices.currency')}>
                    <Select value={currencyInput} onChange={(_, d) => setCurrencyInput(d.value)}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {errorMessage && <Text className="text-red-600">{errorMessage}</Text>}
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                disabled={saveMutation.isPending || !canSave}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? <Spinner size="tiny" /> : t('retailPrices.save')}
              </Button>
              <Button appearance="secondary" onClick={() => setDraft(null)}>
                {t('retailPrices.cancel')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={historyOf !== null} onOpenChange={(_, d) => !d.open && setHistoryOf(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('retailPrices.historyTitle')}</DialogTitle>
            <DialogContent>
              {historyQuery.isLoading ? (
                <Spinner label={t('common.loading')} />
              ) : (
                <ResponsiveTable
                  columns={historyColumns}
                  items={historyQuery.data?.items ?? []}
                  rowKey={(row) => row.id}
                  emptyText={t('retailPrices.noHistory')}
                />
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setHistoryOf(null)}>
                {t('retailPrices.close')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
