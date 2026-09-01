import { Button, Input, Select, Spinner, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import type { ItemDto } from '@otunlink/shared';
import { Permissions, hasPermission } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { getItemByBarcode, listItemCategories, listItems } from '../../api/items';
import { useSession } from '../../auth/SessionProvider';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { ScannerDialog } from '../../components/ScannerDialog';

const PAGE_SIZE = 20;

// 物品目录列表：搜索 + 扫码定位 + 分页。
export function ItemsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useSession();
  const canWrite = hasPermission(me?.role, Permissions.ITEMS_WRITE);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const { data: categories = [] } = useQuery({
    queryKey: ['items', 'categories'],
    queryFn: listItemCategories,
    staleTime: 60_000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items', 'list', debouncedQ, page, category],
    queryFn: () =>
      listItems({ q: debouncedQ || undefined, page, size: PAGE_SIZE, category: category || undefined }),
    placeholderData: keepPreviousData,
  });

  const handleScan = useCallback(
    async (code: string) => {
      setScanMessage(null);
      setScanOpen(false);
      try {
        const item = await getItemByBarcode(code);
        setScanMessage(t('items.messages.scanned'));
        navigate(`/items/${item.id}`);
      } catch (cause) {
        setScanMessage(
          isApiError(cause)
            ? cause.status === 404
              ? t('items.messages.barcodeNotFound')
              : t(errorI18nKey(cause.code))
            : t('errors.UNKNOWN'),
        );
      }
    },
    [navigate, t],
  );

  const columns: ResponsiveTableColumn<ItemDto>[] = [
    {
      key: 'name',
      header: t('items.name'),
      render: (item) => (
        <Link to={`/items/${item.id}`} className="font-medium text-blue-600 hover:underline">
          {item.name}
        </Link>
      ),
    },
    { key: 'sku', header: t('items.sku'), render: (item) => item.sku ?? '—' },
    { key: 'barcode', header: t('items.barcode'), render: (item) => item.barcode ?? '—' },
    { key: 'category', header: t('items.category'), render: (item) => item.category ?? '—' },
    {
      key: 'specUnit',
      header: t('items.specUnit'),
      render: (item) => t(`items.specUnits.${item.specUnit}`),
    },
    {
      key: 'status',
      header: t('items.status'),
      render: (item) =>
        item.status === 'ACTIVE' ? t('items.statusActive') : t('items.statusInactive'),
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('items.title')}</Title1>
        <div className="flex items-center gap-2">
          <Input
            value={q}
            placeholder={t('items.searchPlaceholder')}
            onChange={(_, d) => setQ(d.value)}
            className="min-w-52"
          />
          <Select
            value={category}
            onChange={(_, d) => {
              setCategory(d.value);
              setPage(1);
            }}
            className="min-w-36"
            aria-label={t('items.category')}
          >
            <option value="">{t('items.categoryAll')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Button appearance="secondary" onClick={() => setScanOpen(true)}>
            {t('items.scan')}
          </Button>
          {canWrite && (
            <Link to="/items/new">
              <Button appearance="primary">{t('items.newItem')}</Button>
            </Link>
          )}
        </div>
      </div>

      {scanMessage && <Text className="text-blue-700">{scanMessage}</Text>}

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            items={data?.items ?? []}
            rowKey={(item) => item.id}
            emptyText={t('items.empty')}
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>
              {t('items.total', { total })}
            </span>
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

      <ScannerDialog open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
    </div>
  );
}
