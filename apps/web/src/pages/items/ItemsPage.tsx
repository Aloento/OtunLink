import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { ScannerDialog } from '../../components/ScannerDialog';
import { specUnitOf, unitLabel } from '../../i18n/units';
import { Button } from '../../ui/button';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

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
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeQuery, setMergeQuery] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  // 合并会永久删除来源物品，二次确认改用 <ConfirmDialog>（浏览器原生 confirm 弹窗
  // 无法承载破坏性操作的初始焦点与 tone）。
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

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
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items', 'list', debouncedQ, page, category],
    queryFn: () =>
      listItems({ q: debouncedQ || undefined, page, size: PAGE_SIZE, category: category || undefined }),
    placeholderData: keepPreviousData,
  });
  const mergeCandidates = useQuery({
    queryKey: ['items', 'merge-candidates', mergeQuery],
    queryFn: () => listItems({ q: mergeQuery || undefined, size: 50 }),
    enabled: mergeOpen,
  });

  const handleMerge = async () => {
    if (!mergeTargetId || !mergeSourceId) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergeItem(mergeTargetId, mergeSourceId);
      await refreshAfterWrite(queryClient);
      setMergeOpen(false);
      setMergeTargetId('');
      setMergeSourceId('');
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

  const columns: ResponsiveTableColumn<ItemDto>[] = [
    {
      key: 'name',
      header: t('items.name'),
      render: (item) => (
        <Link to={`/items/${item.id}`} className="font-medium text-brand-700 hover:underline">
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
      key: 'innerUnit',
      header: t('items.innerUnit'),
      render: (item) => innerUnitText(item),
    },
    {
      key: 'minSaleUnit',
      header: t('items.minSaleUnit'),
      // 分组文案 + 实际生效的单位文案（SPEC → 规格单位文案，INNER → 内装单位文案）。
      render: (item) =>
        `${t(`items.minSaleUnits.${item.minSaleUnit}`)} · ${unitLabel(t, specUnitOf(item), item.minSaleUnit)}`,
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
      <PageHeader
        title={t('items.title')}
        actions={
          // 手机上是两列按钮栅格（搜索占满一行），sm 以上收成一行工具条。
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <RefreshButton queryKey={['items', 'list']} additionalKeys={[['items', 'categories']]} />
            <Input
              value={q}
              placeholder={t('items.searchPlaceholder')}
              aria-label={t('items.searchPlaceholder')}
              onChange={(event) => setQ(event.target.value)}
              className="col-span-2 w-full sm:w-56"
            />
            <Select
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
              }}
              className="w-full sm:w-40"
              aria-label={t('items.category')}
            >
              <option value="">{t('items.categoryAll')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Button variant="secondary" className="w-full" onClick={() => setScanOpen(true)}>
              {t('items.scan')}
            </Button>
            {canWrite && (
              <Button asChild variant="primary" className="w-full">
                <Link to="/items/new">{t('items.newItem')}</Link>
              </Button>
            )}
            {canWrite && (
              <Button
                variant="secondary"
                className="col-span-2 w-full sm:col-span-1 sm:w-auto"
                onClick={() => setMergeOpen(true)}
              >
                {t('items.merge')}
              </Button>
            )}
          </div>
        }
      />

      {scanMessage && (
        <p role="status" className="text-sm text-brand-700">
          {scanMessage}
        </p>
      )}

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            items={data?.items ?? []}
            rowKey={(item) => item.id}
            emptyText={t('items.empty')}
            label={t('items.title')}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            totalLabel={t('items.total', { total })}
          />
        </>
      )}

      <ScannerDialog open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen} closeLabel={t('common.close')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('items.mergeTitle')}</DialogTitle>
            <DialogDescription>{t('items.mergeCatalogHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <Input
              value={mergeQuery}
              onChange={(event) => setMergeQuery(event.target.value)}
              placeholder={t('items.mergeSearch')}
              aria-label={t('items.mergeSearch')}
            />
            <Select
              value={mergeTargetId}
              onValueChange={setMergeTargetId}
              aria-label={t('items.mergeTarget')}
            >
              <option value="">{t('items.mergeTarget')}</option>
              {(mergeCandidates.data?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.sku ?? item.id}
                </option>
              ))}
            </Select>
            <Select
              value={mergeSourceId}
              onValueChange={setMergeSourceId}
              aria-label={t('items.mergeSource')}
            >
              <option value="">{t('items.mergeSource')}</option>
              {(mergeCandidates.data?.items ?? [])
                .filter((item) => item.id !== mergeTargetId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.sku ?? item.id}
                  </option>
                ))}
            </Select>
            {mergeError && (
              <p role="alert" className="text-sm text-danger-600">
                {mergeError}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMergeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={merging}
              disabled={!mergeTargetId || !mergeSourceId}
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
