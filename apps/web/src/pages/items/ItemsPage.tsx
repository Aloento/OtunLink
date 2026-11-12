import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, ScanLine } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import type { ItemDto } from '@otunlink/shared';
import { Permissions, hasPermission } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { getItemByBarcode, listItemCategories, listItems, mergeItem } from '../../api/items';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { RefreshButton } from '../../components/RefreshButton';
import { ScannerDialog } from '../../components/ScannerDialog';
import { specUnitOf, unitLabel } from '../../i18n/units';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { DataTable, TablePager, type DataTableColumn } from '../../ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Empty } from '../../ui/empty';
import { EntityPicker } from '../../ui/entity-picker';
import { FilterBar } from '../../ui/filter-bar';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { toast } from '../../ui/toast';

const DEFAULT_PAGE_SIZE = 20;

// 物品目录：ERP 里被查得最频繁的一张表。
// 结构固定为「页头 → 筛选条 → 数据表 → 分页条」，搜索走服务端，行内直接进详情。
export function ItemsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me } = useSession();
  const canWrite = hasPermission(me?.role, Permissions.ITEMS_WRITE);

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [category, setCategory] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ id: string; label: string } | null>(null);
  const [mergeSource, setMergeSource] = useState<{ id: string; label: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  // 搜索变化时回到第一页：否则会停在「第 7 页 / 共 1 页」的空列表上
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, category, pageSize]);

  const { data: categories = [] } = useQuery({
    queryKey: ['items', 'categories'],
    queryFn: listItemCategories,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items', 'list', debouncedQ, page, pageSize, category],
    queryFn: () =>
      listItems({
        q: debouncedQ || undefined,
        page,
        size: pageSize,
        category: category || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const handleMerge = async () => {
    if (!mergeTarget || !mergeSource) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergeItem(mergeTarget.id, mergeSource.id);
      await refreshAfterWrite(queryClient);
      setMergeOpen(false);
      setMergeTarget(null);
      setMergeSource(null);
      toast.success(t('items.mergeDone'));
    } catch (cause) {
      setMergeError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
    } finally {
      setMerging(false);
    }
  };

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

  // 内装单位单元格：单位文案 + 内装数量（innerCount 形如 "24.00"，去掉多余的小数零）。
  const innerUnitText = (item: ItemDto): string => {
    if (!item.innerUnit) return '—';
    const label = t(`items.innerUnits.${item.innerUnit}`);
    const raw = item.innerCount?.trim();
    const count = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(count) ? `${label} / ${String(count)}` : label;
  };

  const searchOptions = async (query: string, targetPage: number) => {
    const result = await listItems({ q: query || undefined, page: targetPage, size: 50 });
    return {
      items: result.items.map((item) => ({
        id: item.id,
        label: item.name,
        meta: [item.sku, item.barcode, item.category].filter(Boolean).join(' · '),
      })),
      total: result.total,
    };
  };

  const columns: DataTableColumn<ItemDto>[] = [
    {
      id: 'name',
      header: t('items.name'),
      width: 260,
      minWidth: 160,
      cell: (item) => (
        <Link
          to={`/items/${item.id}`}
          // 行本身可点，链接自己拦截冒泡，避免同一个跳转触发两次
          onClick={(event) => event.stopPropagation()}
          className="font-medium text-brand-700 hover:underline"
        >
          {item.name}
        </Link>
      ),
    },
    { id: 'sku', header: t('items.sku'), width: 140, cell: (item) => item.sku ?? '—' },
    { id: 'barcode', header: t('items.barcode'), width: 150, cell: (item) => item.barcode ?? '—' },
    { id: 'category', header: t('items.category'), width: 120, cell: (item) => item.category ?? '—' },
    {
      id: 'specUnit',
      header: t('items.specUnit'),
      width: 96,
      cell: (item) => t(`items.specUnits.${item.specUnit}`),
    },
    { id: 'innerUnit', header: t('items.innerUnit'), width: 130, cell: (item) => innerUnitText(item) },
    {
      id: 'minSaleUnit',
      header: t('items.minSaleUnit'),
      width: 160,
      cell: (item) =>
        `${t(`items.minSaleUnits.${item.minSaleUnit}`)} · ${unitLabel(t, specUnitOf(item), item.minSaleUnit)}`,
    },
    {
      id: 'status',
      header: t('items.status'),
      width: 90,
      cell: (item) =>
        item.status === 'ACTIVE' ? (
          <Badge tone="success">{t('items.statusActive')}</Badge>
        ) : (
          <Badge tone="neutral">{t('items.statusInactive')}</Badge>
        ),
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('items.title')}
        description={t('items.total', { total })}
        actions={
          <>
            <Button variant="secondary" onClick={() => setScanOpen(true)} icon={<ScanLine aria-hidden className="size-4" />}>
              {t('items.scan')}
            </Button>
            {canWrite ? (
              <Button variant="secondary" onClick={() => setMergeOpen(true)}>
                {t('items.merge')}
              </Button>
            ) : null}
            {canWrite ? (
              <Button asChild variant="primary">
                <Link to="/items/new">{t('items.newItem')}</Link>
              </Button>
            ) : null}
          </>
        }
      />

      {scanMessage ? (
        <p role="status" className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft">
          {scanMessage}
        </p>
      ) : null}

      <DataTable
        tableId="items"
        caption={t('items.title')}
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(item) => item.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<Package aria-hidden />}
            title={t('items.empty')}
            description={debouncedQ || category ? t('items.noMatch') : undefined}
          />
        }
        onRowClick={(item) => navigate(`/items/${item.id}`)}
        getRowLabel={(item) => `${item.name} ${item.sku ?? ''}`}
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        toolbar={
          <FilterBar
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder={t('items.searchPlaceholder')}
            extra={
              <Select
                value={category}
                onValueChange={setCategory}
                className="w-40"
                aria-label={t('items.category')}
              >
                <option value="">{t('items.categoryAll')}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            }
            resultText={
              total > 0 ? (
                <span>
                  {t('common.picker.count', { count: total.toLocaleString('zh-CN') })}
                </span>
              ) : null
            }
            right={<RefreshButton queryKey={['items', 'list']} additionalKeys={[['items', 'categories']]} />}
          />
        }
        footer={
          <TablePager
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        }
      />

      <ScannerDialog open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen} closeLabel={t('common.close')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('items.mergeTitle')}</DialogTitle>
            <DialogDescription>{t('items.mergeCatalogHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">{t('items.mergeTarget')}</span>
              <EntityPicker
                value={mergeTarget?.id ?? ''}
                displayValue={mergeTarget?.label}
                title={t('items.mergeTarget')}
                onSearch={searchOptions}
                onChange={(option) => setMergeTarget({ id: option.id, label: option.label })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-soft">{t('items.mergeSource')}</span>
              <EntityPicker
                value={mergeSource?.id ?? ''}
                displayValue={mergeSource?.label}
                title={t('items.mergeSource')}
                onSearch={searchOptions}
                onChange={(option) => setMergeSource({ id: option.id, label: option.label })}
              />
            </div>
            {mergeError ? (
              <p role="alert" className="text-xs text-danger-600">
                {mergeError}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMergeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              icon={merging ? undefined : <Pencil aria-hidden className="size-4" />}
              loading={merging}
              disabled={!mergeTarget || !mergeSource}
              onClick={() => setMergeConfirmOpen(true)}
            >
              {t('items.merge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={mergeConfirmOpen}
        onOpenChange={setMergeConfirmOpen}
        title={t('items.mergeConfirm')}
        confirmLabel={t('common.confirm')}
        tone="danger"
        busy={merging}
        onConfirm={() => {
          setMergeConfirmOpen(false);
          void handleMerge();
        }}
      />
    </div>
  );
}
