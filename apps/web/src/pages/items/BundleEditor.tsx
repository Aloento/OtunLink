import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listItems, setItemBundle, type BundleComponentDto } from '../../api/items';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Combobox } from '../../ui/combobox';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';

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
  const options = (candidates?.items ?? [])
    .filter((item) => item.id !== itemId)
    // 已加入的组件置灰但仍留在列表里（保留「搜索 → 选择 → 追加行」的原有语义）。
    .map((item) => ({
      value: item.id,
      label: item.name,
      description: item.sku ?? undefined,
      disabled: selectedIds.has(item.id),
    }));

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
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink">{t('items.bundleTitle')}</h2>
        <p className="text-xs text-ink-muted">{t('items.bundleHint')}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {savedMsg && (
        <p role="status" className="text-sm text-success-600">
          {savedMsg}
        </p>
      )}

      <Field label={t('items.bundleAddComponent')}>
        <Combobox
          value={search}
          onValueChange={setSearch}
          options={options}
          onSelect={(option) => addRow(option.value, option.label)}
          placeholder={t('items.bundleSearchPlaceholder')}
          loading={isFetching}
          loadingText={t('common.loading')}
          emptyText={t('items.empty')}
          aria-label={t('items.bundleAddComponent')}
        />
      </Field>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-subtle">{t('items.bundleEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.itemId} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.name}</span>
              <span aria-hidden className="text-sm text-ink-subtle">
                ×
              </span>
              <Input
                className="w-24 shrink-0"
                value={row.qty}
                inputMode="decimal"
                aria-label={`${row.name} ${t('inventory.qty')}`}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((item) =>
                      item.itemId === row.itemId ? { ...item, qty: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                size="sm"
                variant="subtle"
                className="shrink-0"
                // 每行一个「移除」：把组件名拼进可访问名称，否则屏幕阅读器只会读到
                // 一串彼此无法区分的「移除, 按钮」。
                aria-label={`${t('common.remove')} ${row.name}`}
                onClick={() => setRows((prev) => prev.filter((item) => item.itemId !== row.itemId))}
              >
                {t('common.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          {t('items.bundleSave')}
        </Button>
        <p className="text-xs text-ink-subtle">{t('items.bundleSaveHint')}</p>
      </div>
    </Card>
  );
}
