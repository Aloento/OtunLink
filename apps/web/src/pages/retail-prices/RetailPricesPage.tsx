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
import { listPartnerships } from '../../api/partnerships';
import { listRetailPriceHistory, listRetailPrices, putRetailPrice } from '../../api/retail-prices';
import { listUnits } from '../../api/units';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { unitLabel } from '../../i18n/units';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

const CURRENCIES = ['CNY', 'USD', 'EUR'] as const;

// 零售价管理：仓库 × 物品当前价 + 历史留痕；unit_cost 仅只读展示。
export function RetailPricesPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
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
  });
  const partnershipsQuery = useQuery({
    queryKey: ['partnerships', 'list'],
    queryFn: () => listPartnerships(),
  });
  const { data: itemPage } = useQuery({
    queryKey: ['items', 'picker', ''],
    queryFn: () => listItems({ size: 100 }),
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
    { key: 'spec', header: t('retailPrices.spec'), render: (row) => unitLabel(t, row.spec, row.minSaleUnit) },
    {
      key: 'price',
      header: t('retailPrices.price'),
      // 金额右对齐 + 等宽数字，便于逐行比较价位。
      render: (row) => (
        <span className="block text-end tabular-nums">{`${row.currency} ${row.price}`}</span>
      ),
    },
    {
      key: 'unitCost',
      header: t('retailPrices.unitCost'),
      render: (row) => (
        <span className="block text-end tabular-nums">{row.unitCost === null ? '—' : row.unitCost}</span>
      ),
    },
    {
      key: 'updatedByName',
      header: t('retailPrices.updatedByName'),
      render: (row) => row.updatedByName ?? row.updatedBy ?? '—',
    },
    {
      key: 'updatedAt',
      header: t('retailPrices.updatedAt'),
      render: (row) => formatDateTime(row.updatedAt, locale),
    },
  ];

  const historyColumns: ResponsiveTableColumn<RetailPriceHistoryDto>[] = [
    {
      key: 'updatedAt',
      header: t('retailPrices.updatedAt'),
      render: (row) => formatDateTime(row.updatedAt, locale),
    },
    {
      key: 'price',
      header: t('retailPrices.price'),
      render: (row) => (
        <span className="block text-end tabular-nums">{`${row.currency} ${row.price}`}</span>
      ),
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
      <PageHeader
        title={t('retailPrices.title')}
        actions={
          <>
            <RefreshButton
              queryKey={['retail-prices']}
              additionalKeys={[['items', 'picker'], ['units', 'list'], ['partnerships', 'list']]}
            />
            <p className="text-xs text-ink-subtle">{t('retailPrices.unitCostHint')}</p>
            {canWrite && (
              <Button variant="primary" onClick={openCreate}>
                {t('retailPrices.add')}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          value={unitId}
          onValueChange={setUnitId}
          className="w-full sm:w-56"
          aria-label={t('retailPrices.unit')}
        >
          <option value="">{t('retailPrices.allUnits')}</option>
          {warehouses.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          value={itemId}
          onValueChange={setItemId}
          className="w-full sm:w-56"
          aria-label={t('retailPrices.item')}
        >
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
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      ) : (
        <ResponsiveTable
          columns={columns}
          items={pricesQuery.data?.items ?? []}
          rowKey={(row) => row.id}
          emptyText={t('retailPrices.empty')}
          label={t('retailPrices.title')}
          actions={(row) => (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                // 每行都有「历史 / 编辑」：把物品名拼进可访问名称，否则屏幕阅读器只听到
                // 同一串无法区分的按钮名。
                aria-label={`${t('retailPrices.history')} ${row.itemName ?? row.itemId}`}
                onClick={() => setHistoryOf(row)}
              >
                {t('retailPrices.history')}
              </Button>
              {canWrite && (
                <Button
                  size="sm"
                  variant="primary"
                  aria-label={`${t('retailPrices.edit')} ${row.itemName ?? row.itemId}`}
                  onClick={() => openEdit(row)}
                >
                  {t('retailPrices.edit')}
                </Button>
              )}
            </div>
          )}
        />
      )}

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
                    {draft.unitName ?? draft.unitId} · {draft.itemName ?? draft.itemId}
                  </p>
                ) : (
                  <>
                    <Field label={t('retailPrices.unit')} required>
                      <Select
                        value={draft.unitId}
                        onValueChange={(value) =>
                          setDraft((prev) =>
                            prev ? { ...prev, unitId: value, unitName: null } : prev,
                          )
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
                        onValueChange={(value) =>
                          setDraft((prev) =>
                            prev ? { ...prev, itemId: value, itemName: null } : prev,
                          )
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('retailPrices.historyTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {historyQuery.isLoading ? (
              <Spinner label={t('common.loading')} />
            ) : (
              <ResponsiveTable
                columns={historyColumns}
                items={historyQuery.data?.items ?? []}
                rowKey={(row) => row.id}
                emptyText={t('retailPrices.noHistory')}
                label={t('retailPrices.historyTitle')}
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
