import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Select,
  Spinner,
  Text,
  Title1,
} from '@fluentui/react-components';
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
import { useSession } from '../../auth/SessionProvider';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

// 可售客户（零售合作方）管理（design.md §3.2.1）：仓库把零售加入自己的「可售客户」列表即签约生效。
// 仅 WAREHOUSE（自己仓库）/ ADMIN（全量）可见；签约无需零售同意、无状态字段。
export function PartnershipsPage() {
  const { t } = useTranslation();
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
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      setDraft(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => deletePartnership(removeTarget!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      setRemoveTarget(null);
    },
  });

  const openAdd = () => {
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
    { key: 'createdAt', header: t('partnerships.createdAt'), render: (row: PartnershipDto) => row.createdAt },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('partnerships.title')}</Title1>
        <Button appearance="primary" onClick={openAdd}>
          {t('partnerships.add')}
        </Button>
      </div>

      {partnershipsQuery.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : partnershipsQuery.isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <ResponsiveTable
          columns={columns}
          items={rows}
          rowKey={(row) => row.id}
          emptyText={t('partnerships.empty')}
          actions={(row) => (
            <Button size="small" appearance="secondary" onClick={() => setRemoveTarget(row)}>
              {t('partnerships.remove')}
            </Button>
          )}
        />
      )}

      <Dialog open={draft !== null} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('partnerships.addTitle')}</DialogTitle>
            <DialogContent>
              <div className="flex flex-col gap-3">
                {isAdmin && (
                  <Field label={t('partnerships.warehouse')} required>
                    <Select
                      value={draft?.warehouseUnitId ?? ''}
                      onChange={(_, d) =>
                        setDraft((prev) => (prev ? { ...prev, warehouseUnitId: d.value } : prev))
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
                    value={draft?.retailerUnitId ?? ''}
                    onChange={(_, d) =>
                      setDraft((prev) => (prev ? { ...prev, retailerUnitId: d.value } : prev))
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
                {addError && <Text className="text-red-600">{addError}</Text>}
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                disabled={addMutation.isPending || !canAdd}
                onClick={() => addMutation.mutate()}
              >
                {addMutation.isPending ? <Spinner size="tiny" /> : t('partnerships.save')}
              </Button>
              <Button appearance="secondary" onClick={() => setDraft(null)}>
                {t('partnerships.cancel')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(_, d) => !d.open && setRemoveTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('partnerships.removeTitle')}</DialogTitle>
            <DialogContent>
              <Text>
                {removeTarget
                  ? `${removeTarget.retailerUnitName ?? removeTarget.retailerUnitId}${
                      isAdmin
                        ? ` · ${removeTarget.warehouseUnitName ?? removeTarget.warehouseUnitId}`
                        : ''
                    }`
                  : ''}
              </Text>
              {removeError && <Text className="text-red-600">{removeError}</Text>}
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate()}
              >
                {removeMutation.isPending ? <Spinner size="tiny" /> : t('partnerships.removeConfirm')}
              </Button>
              <Button appearance="secondary" onClick={() => setRemoveTarget(null)}>
                {t('partnerships.cancel')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
