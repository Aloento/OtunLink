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
  Tab,
  TabList,
  Text,
  Title1,
} from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { RefreshButton } from '../../components/RefreshButton';

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
  timezone: string;
  baseCurrency: string;
  isActive: string;
}

const emptyDraft = (): Draft => ({
  mode: 'create',
  code: '',
  name: '',
  type: 'WAREHOUSE',
  address: '',
  contact: '',
  timezone: 'Asia/Shanghai',
  baseCurrency: 'CNY',
  isActive: 'true',
});

// 业务单元管理（AD02）：管理员维护组织内的集货/仓库/零售单元。
export function AdminUnitsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<{ error?: string } | null>(null);
  const [view, setView] = useState<'all' | UnitType>('all');
  const [deleting, setDeleting] = useState<UnitDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          timezone: draft.timezone.trim() || undefined,
          baseCurrency: draft.baseCurrency.trim() || undefined,
          isActive,
        });
      }
      return updateAdminUnit(draft.id!, {
        code: draft.code.trim(),
        name: draft.name.trim(),
        type: draft.type,
        address: draft.address.trim() || null,
        contact: draft.contact.trim() || null,
        timezone: draft.timezone.trim() || undefined,
        baseCurrency: draft.baseCurrency.trim() || undefined,
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
      await queryClient.invalidateQueries({ queryKey: ['admin', 'units'] });
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
      timezone: row.timezone ?? '',
      baseCurrency: row.baseCurrency ?? '',
      isActive: row.isActive ? 'true' : 'false',
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUnit(id),
    onSuccess: async (res) => {
      queryClient.setQueryData<UnitDto[]>(['admin', 'units'], (prev) =>
        prev?.filter((u) => u.id !== res.id),
      );
      await queryClient.invalidateQueries({ queryKey: ['admin', 'units'] });
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

  const filtered = (units ?? []).filter((u) => view === 'all' || u.type === view);

  const submit = () => {
    if (!draft) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setSaving({ error: t('admin.units.requiredFields') });
      return;
    }
    setSaving(null);
    saveMutation.mutate();
  };

  const columns: ResponsiveTableColumn<UnitDto>[] = [
    { key: 'code', header: t('admin.units.code'), render: (u) => u.code },
    { key: 'name', header: t('admin.units.name'), render: (u) => u.name },
    {
      key: 'type',
      header: t('admin.units.type'),
      render: (u) => t(UNIT_TYPE_LABEL_KEY[u.type]),
    },
    { key: 'address', header: t('admin.units.address'), render: (u) => u.address ?? '—' },
    { key: 'contact', header: t('admin.units.contact'), render: (u) => u.contact ?? '—' },
    {
      key: 'isActive',
      header: t('admin.units.isActive'),
      render: (u) => (u.isActive ? t('common.yes') : t('common.no')),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('admin.units.title')}</Title1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKey={['admin', 'units']} />
          <Button appearance="primary" onClick={openCreate}>
            {t('admin.units.newUnit')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <>
          <TabList selectedValue={view} onTabSelect={(_, d) => setView(d.value as 'all' | UnitType)}>
            <Tab value="all">{t('admin.units.tabAll')}</Tab>
            {UNIT_TYPES.map((typ) => (
              <Tab key={typ} value={typ}>
                {t(UNIT_TYPE_LABEL_KEY[typ])}
              </Tab>
            ))}
          </TabList>
          <ResponsiveTable
            columns={columns}
            items={filtered}
            rowKey={(u) => u.id}
            emptyText={t('admin.units.empty')}
            actions={(u) => (
              <div className="flex items-center gap-2">
                <Button size="small" appearance="secondary" onClick={() => openEdit(u)}>
                  {t('admin.units.edit')}
                </Button>
                <Button size="small" appearance="outline" onClick={() => openDelete(u)}>
                  {t('admin.units.delete')}
                </Button>
              </div>
            )}
          />
        </>
      )}

      <Dialog open={draft !== null} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {draft?.mode === 'create' ? t('admin.units.createTitle') : t('admin.units.editTitle')}
            </DialogTitle>
            <DialogContent className="flex flex-col gap-4">
              <Field label={t('admin.units.code')} required>
                <Input
                  value={draft?.code ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, code: d.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.name')} required>
                <Input
                  value={draft?.name ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, name: d.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.type')}>
                <Select
                  value={draft?.type ?? 'WAREHOUSE'}
                  onChange={(_, d) => setDraft({ ...draft!, type: d.value as UnitType })}
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
                  onChange={(_, d) => setDraft({ ...draft!, address: d.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.contact')}>
                <Input
                  value={draft?.contact ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, contact: d.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.timezone')}>
                <Input
                  value={draft?.timezone ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, timezone: d.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.baseCurrency')}>
                <Input
                  value={draft?.baseCurrency ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, baseCurrency: d.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.units.isActive')}>
                <Select
                  value={draft?.isActive ?? 'true'}
                  onChange={(_, d) => setDraft({ ...draft!, isActive: d.value })}
                  disabled={saveMutation.isPending}
                >
                  <option value="true">{t('common.yes')}</option>
                  <option value="false">{t('common.no')}</option>
                </Select>
              </Field>
              {saving?.error && <Text className="text-red-600">{saving.error}</Text>}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setDraft(null)}
                disabled={saveMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button appearance="primary" onClick={submit} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? t('common.loading') : t('common.confirm')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(_, d) => !d.open && setDeleting(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('admin.units.deleteTitle')}</DialogTitle>
            <DialogContent>
              <Text>{t('admin.units.deleteConfirm', { name: deleting?.name ?? '' })}</Text>
              {deleteError && (
                <Text className="mt-2 block text-red-600">{deleteError}</Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setDeleting(null)}
                disabled={deleteMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                appearance="primary"
                onClick={() => deleting && deleteMutation.mutate(deleting.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? t('common.loading') : t('admin.units.deleteConfirmBtn')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
