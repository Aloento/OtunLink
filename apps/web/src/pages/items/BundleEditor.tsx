import { Button, Caption1, Combobox, Field, Input, Option, Spinner } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listItems, setItemBundle, type BundleComponentDto } from '../../api/items';

interface Row {
  itemId: string;
  name: string;
  qty: string;
}

/**
 * 组合商品编辑器（物品编辑页使用）。
 * 组合商品本身仍是一条普通物品（有 SKU、有售价），这里只维护「包含哪些组件、各几件」；
 * 销售单里它的行会被后端展开成组件行（带归组标记），出库/拣货作用在真实组件上。
 */
export function BundleEditor({
  itemId,
  initial,
}: {
  itemId: string;
  initial: BundleComponentDto[];
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>(
    initial.map((c) => ({ itemId: c.componentItemId, name: c.componentName ?? c.componentItemId, qty: c.qty })),
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const { data: candidates, isFetching } = useQuery({
    queryKey: ['items', 'bundle-candidates', search],
    queryFn: () => listItems({ q: search.trim() || undefined, size: 20 }),
    enabled: search.trim().length > 0,
  });

  const selectedIds = new Set(rows.map((row) => row.itemId));
  const options = (candidates?.items ?? []).filter((item) => item.id !== itemId);

  const addRow = (id: string, name: string) => {
    setRows((prev) => (prev.some((row) => row.itemId === id) ? prev : [...prev, { itemId: id, name, qty: '1' }]));
    setSearch('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await setItemBundle(
        itemId,
        rows.map((row) => ({ itemId: row.itemId, qty: row.qty.trim() || '1' })),
      );
      setSavedMsg(t('items.bundleSaved'));
    } catch {
      setError(t('items.bundleSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <div>
        <h2 className="text-base font-semibold">{t('items.bundleTitle')}</h2>
        <Caption1 className="text-neutral-600">{t('items.bundleHint')}</Caption1>
      </div>

      {error && <span className="text-sm text-red-600">{error}</span>}
      {savedMsg && <span className="text-sm text-green-700">{savedMsg}</span>}

      <Field label={t('items.bundleAddComponent')}>
        <Combobox
          freeform
          value={search}
          placeholder={t('items.bundleSearchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
          onOptionSelect={(_, data) => {
            if (data.optionValue) addRow(data.optionValue, data.optionText ?? data.optionValue);
          }}
        >
          {isFetching && <Option key="loading" value="" disabled text={t('common.loading')} />}
          {options.map((item) => (
            <Option key={item.id} value={item.id} text={item.name} disabled={selectedIds.has(item.id)}>
              {item.name}
            </Option>
          ))}
        </Combobox>
      </Field>

      {rows.length === 0 ? (
        <Caption1 className="text-neutral-500">{t('items.bundleEmpty')}</Caption1>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.itemId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
              <span className="text-sm text-neutral-500">×</span>
              <Input
                className="w-24"
                value={row.qty}
                inputMode="decimal"
                onChange={(_, data) =>
                  setRows((prev) =>
                    prev.map((item) => (item.itemId === row.itemId ? { ...item, qty: data.value } : item)),
                  )
                }
              />
              <Button
                appearance="subtle"
                onClick={() => setRows((prev) => prev.filter((item) => item.itemId !== row.itemId))}
              >
                {t('common.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button appearance="primary" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner size="tiny" /> : t('items.bundleSave')}
        </Button>
        <Caption1 className="text-neutral-500">{t('items.bundleSaveHint')}</Caption1>
      </div>
    </section>
  );
}
