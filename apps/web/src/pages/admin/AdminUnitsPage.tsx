import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { UNIT_TYPES, type UnitType } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import {
  createAdminUnit,
  deleteAdminUnit,
  listAdminUnits,
  updateAdminUnit,
} from '../../api/admin';
import { type UnitDto } from '../../api/units';
import { refreshAfterWrite } from '../../api/queryClient';
import { RefreshButton } from '../../components/RefreshButton';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Empty } from '../../ui/empty';
import { Field } from '../../ui/field';
import { FilterBar } from '../../ui/filter-bar';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';

const DEFAULT_PAGE_SIZE = 20;

const UNIT_TYPE_LABEL_KEY: Record<UnitType, string> = {
  COLLECTOR: 'admin.units.typeCollector',
  WAREHOUSE: 'admin.units.typeWarehouse',
  RETAILER: 'admin.units.typeRetailer',
};

interface Draft {
  mode: 'create' | 'edit';
  id?: string;
  code: string;
  name: string;
  type: UnitType;
  address: string;
  contact: string;
  isActive: string;
}

const emptyDraft = (): Draft => ({
  mode: 'create',
  code: '',
  name: '',
  type: 'WAREHOUSE',
  address: '',
  contact: '',
  isActive: 'true',
});

// 破坏性确认的初始焦点落在「取消」上，避免回车误删。
const autofocusCancel = { 'data-autofocus': '' } as Record<string, string>;

// 业务单元管理（AD02）：管理员维护组织内的集货/仓库/零售单元。
export function AdminUnitsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<{ error?: string } | null>(null);
  // 类型筛选：'all' 或 UNIT_TYPES 之一（原来是 Tab，现在收进工具条的下拉）。
  const [view, setView] = useState<'all' | UnitType>('all');
  const [deleting, setDeleting] = useState<UnitDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 列表接口返回全量业务单元，分页与类型筛选都在客户端完成。
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 切筛选或切每页条数都要回到第 1 页，否则会停在已经不存在的页码上。
  useEffect(() => {
    setPage(1);
  }, [view, pageSize]);

  const { data: units, isLoading, isError } = useQuery({
    queryKey: ['admin', 'units'],
    queryFn: () => listAdminUnits(),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) return Promise.reject(new Error('no draft'));
      const isActive = draft.isActive === 'true';
      if (draft.mode === 'create') {
        return createAdminUnit({
          code: draft.code.trim(),
          name: draft.name.trim(),
          type: draft.type,
          address: draft.address.trim() || undefined,
          contact: draft.contact.trim() || undefined,
          isActive,
        });
      }
      return updateAdminUnit(draft.id!, {
        code: draft.code.trim(),
        name: draft.name.trim(),
        type: draft.type,
        address: draft.address.trim() || null,
        contact: draft.contact.trim() || null,
        isActive,
      });
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData<UnitDto[]>(['admin', 'units'], (prev) => {
        if (!prev) return prev;
        const index = prev.findIndex((u) => u.id === saved.id);
        if (index === -1) return [saved, ...prev];
        const next = [...prev];
        next[index] = saved;
        return next;
      });
      await refreshAfterWrite(queryClient);
      setDraft(null);
    },
    onError: (cause) => {
      setSaving({ error: isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN') });
    },
  });

  const openCreate = () => {
    setSaving(null);
    setDraft(emptyDraft());
  };

  const openEdit = (row: UnitDto) => {
    setSaving(null);
    setDraft({
      mode: 'edit',
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      address: row.address ?? '',
      contact: row.contact ?? '',
      isActive: row.isActive ? 'true' : 'false',
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUnit(id),
    onSuccess: async (res) => {
      queryClient.setQueryData<UnitDto[]>(['admin', 'units'], (prev) =>
        prev?.filter((u) => u.id !== res.id),
      );
      await refreshAfterWrite(queryClient);
      setDeleteError(null);
      setDeleting(null);
    },
    onError: (cause) => {
      setDeleteError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    },
  });

  const openDelete = (row: UnitDto) => {
    setDeleteError(null);
    setDeleting(row);
  };

  const submit = () => {
    if (!draft) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setSaving({ error: t('admin.units.requiredFields') });
      return;
    }
    setSaving(null);
    saveMutation.mutate();
  };

  const filtered = useMemo(
    () => (units ?? []).filter((u) => view === 'all' || u.type === view),
    [units, view],
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // 过滤后页码可能越界（例如停在第 3 页时切到只剩 1 页的类型），先夹住再切页。
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  const columns: DataTableColumn<UnitDto>[] = [
    {
      id: 'code',
      header: t('admin.units.code'),
      width: 120,
      minWidth: 80,
      hideable: false,
      cell: (u) => <span className="font-medium text-ink">{u.code}</span>,
    },
    { id: 'name', header: t('admin.units.name'), width: 220, minWidth: 140, cell: (u) => u.name },
    {
      id: 'type',
      header: t('admin.units.type'),
      width: 96,
      cell: (u) => t(UNIT_TYPE_LABEL_KEY[u.type]),
    },
    { id: 'address', header: t('admin.units.address'), width: 260, cell: (u) => u.address ?? '—' },
    { id: 'contact', header: t('admin.units.contact'), width: 160, cell: (u) => u.contact ?? '—' },
    {
      id: 'isActive',
      header: t('admin.units.isActive'),
      width: 88,
      cell: (u) =>
        u.isActive ? (
          <Badge tone="success">{t('common.yes')}</Badge>
        ) : (
          <Badge tone="neutral">{t('common.no')}</Badge>
        ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('admin.units.title')}
        description={t('common.picker.count', { count: total.toLocaleString('zh-CN') })}
        actions={
          <Button variant="primary" onClick={openCreate}>
            {t('admin.units.newUnit')}
          </Button>
        }
      />

      <DataTable
        tableId="admin-units"
        caption={t('admin.units.title')}
        columns={columns}
        rows={pageRows}
        rowKey={(u) => u.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<Building2 aria-hidden />}
            title={t('admin.units.empty')}
            description={view === 'all' ? undefined : t('common.noResults')}
          />
        }
        rowActions={(u) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`${t('common.actions')} ${u.name}`}>
                <Ellipsis aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => openEdit(u)}>
                <Pencil aria-hidden className="size-3.5" />
                {t('admin.units.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-danger-600" onSelect={() => openDelete(u)}>
                <Trash2 aria-hidden className="size-3.5" />
                {t('admin.units.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        toolbar={
          <FilterBar
            extra={
              <Select
                value={view}
                onValueChange={(value) => setView(value as 'all' | UnitType)}
                className="w-32"
                aria-label={t('admin.units.type')}
              >
                <option value="all">{t('admin.units.tabAll')}</option>
                {UNIT_TYPES.map((typ) => (
                  <option key={typ} value={typ}>
                    {t(UNIT_TYPE_LABEL_KEY[typ])}
                  </option>
                ))}
              </Select>
            }
            right={<RefreshButton queryKey={['admin', 'units']} />}
          />
        }
        footer={
          <TablePager
            page={currentPage}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        }
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
              {draft?.mode === 'create' ? t('admin.units.createTitle') : t('admin.units.editTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <Field label={t('admin.units.code')} required>
                <Input
                  {...{ 'data-autofocus': '' }}
                  value={draft?.code ?? ''}
                  onChange={(event) => setDraft({ ...draft!, code: event.target.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.name')} required>
                <Input
                  value={draft?.name ?? ''}
                  onChange={(event) => setDraft({ ...draft!, name: event.target.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.type')}>
                <Select
                  value={draft?.type ?? 'WAREHOUSE'}
                  onValueChange={(value) => setDraft({ ...draft!, type: value as UnitType })}
                  disabled={saveMutation.isPending}
                >
                  {UNIT_TYPES.map((typ) => (
                    <option key={typ} value={typ}>
                      {t(UNIT_TYPE_LABEL_KEY[typ])}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('admin.units.address')}>
                <Input
                  value={draft?.address ?? ''}
                  onChange={(event) => setDraft({ ...draft!, address: event.target.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.contact')}>
                <Input
                  value={draft?.contact ?? ''}
                  onChange={(event) => setDraft({ ...draft!, contact: event.target.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.isActive')}>
                <Select
                  value={draft?.isActive ?? 'true'}
                  onValueChange={(value) => setDraft({ ...draft!, isActive: value })}
                  disabled={saveMutation.isPending}
                >
                  <option value="true">{t('common.yes')}</option>
                  <option value="false">{t('common.no')}</option>
                </Select>
              </Field>
              {saving?.error && (
                <p role="alert" className="text-sm text-danger-600">
                  {saving.error}
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saveMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              onClick={submit}
              disabled={saveMutation.isPending}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
        closeLabel={t('common.close')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.units.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.units.deleteConfirm', { name: deleting?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {deleteError && (
              <p role="alert" className="text-sm text-danger-600">
                {deleteError}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              {...autofocusCancel}
              variant="secondary"
              onClick={() => setDeleting(null)}
              disabled={deleteMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              disabled={deleteMutation.isPending}
            >
              {t('admin.units.deleteConfirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
