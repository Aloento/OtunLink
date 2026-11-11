import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorI18nKey, isApiError } from '../../api/http';
import {
  createPartnership,
  deletePartnership,
  listPartnerCandidates,
  listPartnerships,
  type PartnershipDto,
} from '../../api/partnerships';
import { listUnits } from '../../api/units';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Field } from '../../ui/field';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

// 破坏性确认的初始焦点落在「取消」上，避免回车误删。
const autofocusCancel = { 'data-autofocus': '' } as Record<string, string>;

// 可售客户（零售合作方）管理：仓库把零售加入自己的「可售客户」列表即签约生效。
// 仅 WAREHOUSE（自己仓库）/ ADMIN（全量）可见；签约无需零售同意、无状态字段。
export function PartnershipsPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const queryClient = useQueryClient();

  const isAdmin = me?.role === 'ADMIN';

  const [draft, setDraft] = useState<{ warehouseUnitId: string; retailerUnitId: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PartnershipDto | null>(null);

  const partnershipsQuery = useQuery({
    queryKey: ['partnerships', 'list'],
    queryFn: () => listPartnerships(),
  });
  const candidatesQuery = useQuery({
    queryKey: ['partnerships', 'candidates'],
    queryFn: () => listPartnerCandidates(),
    enabled: me?.role === 'WAREHOUSE' || isAdmin,
  });
  const unitsQuery = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => listUnits(),
    enabled: isAdmin,
  });

  const warehouses = useMemo(
    () => (unitsQuery.data ?? []).filter((u) => u.type === 'WAREHOUSE' && u.isActive),
    [unitsQuery.data],
  );

  const rows = partnershipsQuery.data?.items ?? [];
  const existingKeys = useMemo(
    () => new Set(rows.map((r) => `${r.warehouseUnitId}:${r.retailerUnitId}`)),
    [rows],
  );
  const candidates = useMemo(
    () =>
      (candidatesQuery.data?.items ?? []).filter(
        (u) => u.isActive && !existingKeys.has(`${draft?.warehouseUnitId ?? me?.scopeUnitId}:${u.id}`),
      ),
    [candidatesQuery.data, existingKeys, draft?.warehouseUnitId, me?.scopeUnitId],
  );

  const addMutation = useMutation({
    mutationFn: () =>
      createPartnership({
        retailerUnitId: draft!.retailerUnitId,
        ...(draft!.warehouseUnitId ? { warehouseUnitId: draft!.warehouseUnitId } : {}),
      }),
    onSuccess: async () => {
      await refreshAfterWrite(queryClient);
      setDraft(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => deletePartnership(removeTarget!.id),
    onSuccess: async () => {
      await refreshAfterWrite(queryClient);
      setRemoveTarget(null);
    },
  });

  const openAdd = () => {
    // 清掉上一次失败留下的错误，避免重开弹窗时显示过期的报错。
    addMutation.reset();
    setDraft({ warehouseUnitId: '', retailerUnitId: '' });
  };

  const canAdd = Boolean(
    draft && draft.retailerUnitId && (isAdmin ? Boolean(draft.warehouseUnitId) : true),
  );

  const addError = addMutation.isError
    ? isApiError(addMutation.error)
      ? t(errorI18nKey(addMutation.error.code))
      : t('errors.UNKNOWN')
    : null;
  const removeError = removeMutation.isError
    ? isApiError(removeMutation.error)
      ? t(errorI18nKey(removeMutation.error.code))
      : t('errors.UNKNOWN')
    : null;

  const columns: ResponsiveTableColumn<PartnershipDto>[] = [
    ...(isAdmin
      ? ([
          {
            key: 'warehouse',
            header: t('partnerships.warehouse'),
            render: (row: PartnershipDto) => row.warehouseUnitName ?? row.warehouseUnitId,
          },
        ] as ResponsiveTableColumn<PartnershipDto>[])
      : []),
    {
      key: 'retailer',
      header: t('partnerships.retailer'),
      render: (row: PartnershipDto) => row.retailerUnitName ?? row.retailerUnitId,
    },
    {
      key: 'createdAt',
      header: t('partnerships.createdAt'),
      render: (row: PartnershipDto) => (row.createdAt ? formatDateTime(row.createdAt, locale) : '—'),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('partnerships.title')}
        actions={
          <>
            <RefreshButton
              queryKey={['partnerships', 'list']}
              additionalKeys={[['partnerships', 'candidates'], ['units', 'list']]}
            />
            <Button variant="primary" onClick={openAdd}>
              {t('partnerships.add')}
            </Button>
          </>
        }
      />

      {partnershipsQuery.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : partnershipsQuery.isError ? (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      ) : (
        <ResponsiveTable
          columns={columns}
          items={rows}
          rowKey={(row) => row.id}
          emptyText={t('partnerships.empty')}
          label={t('partnerships.title')}
          actions={(row) => (
            <Button
              size="sm"
              variant="danger"
              aria-label={`${t('partnerships.remove')} ${row.retailerUnitName ?? row.retailerUnitId}`}
              onClick={() => setRemoveTarget(row)}
            >
              {t('partnerships.remove')}
            </Button>
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
            <DialogTitle>{t('partnerships.addTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              {isAdmin && (
                <Field label={t('partnerships.warehouse')} required>
                  <Select
                    {...{ 'data-autofocus': '' }}
                    value={draft?.warehouseUnitId ?? ''}
                    onValueChange={(value) =>
                      setDraft((prev) => (prev ? { ...prev, warehouseUnitId: value } : prev))
                    }
                  >
                    <option value="">{t('partnerships.selectWarehouse')}</option>
                    {warehouses.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={t('partnerships.retailer')} required>
                <Select
                  {...{ 'data-autofocus': isAdmin ? undefined : '' }}
                  value={draft?.retailerUnitId ?? ''}
                  onValueChange={(value) =>
                    setDraft((prev) => (prev ? { ...prev, retailerUnitId: value } : prev))
                  }
                >
                  <option value="">{t('partnerships.selectRetailer')}</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {addError && (
                <p role="alert" className="text-sm text-danger-600">
                  {addError}
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="primary" loading={addMutation.isPending} disabled={!canAdd} onClick={() => addMutation.mutate()}>
              {t('partnerships.save')}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t('partnerships.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        closeLabel={t('common.close')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('partnerships.removeTitle')}</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `${removeTarget.retailerUnitName ?? removeTarget.retailerUnitId}${
                    isAdmin
                      ? ` · ${removeTarget.warehouseUnitName ?? removeTarget.warehouseUnitId}`
                      : ''
                  }`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {removeError && (
              <p role="alert" className="text-sm text-danger-600">
                {removeError}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              {...autofocusCancel}
              variant="secondary"
              onClick={() => setRemoveTarget(null)}
            >
              {t('partnerships.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              {t('partnerships.removeConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
