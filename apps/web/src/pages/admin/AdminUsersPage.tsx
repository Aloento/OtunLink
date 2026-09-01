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
  Text,
  Title1,
} from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { USER_ROLES, USER_STATUSES } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUnits,
  listAdminUsers,
  updateAdminUser,
  type AdminUserDto,
} from '../../api/admin';
import { type UnitDto } from '../../api/units';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';

interface Draft {
  mode: 'create' | 'edit';
  id?: string;
  entraSub: string;
  email: string;
  name: string;
  role: string;
  scopeUnitId: string;
  status: string;
  locale: string;
}

const emptyDraft = (): Draft => ({
  mode: 'create',
  entraSub: '',
  email: '',
  name: '',
  role: 'COLLECTOR',
  scopeUnitId: '',
  status: 'ACTIVE',
  locale: 'zh-CN',
});

// 用户管理（AD01）：管理员为用户分配岗位与数据范围。
export function AdminUsersPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<{ error?: string } | null>(null);
  const [deleting, setDeleting] = useState<AdminUserDto | null>(null);

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => listAdminUsers(),
  });
  const { data: units } = useQuery({
    queryKey: ['admin', 'units'],
    queryFn: () => listAdminUnits(),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!draft) return Promise.reject(new Error('no draft'));
      const scopeUnitId = draft.scopeUnitId || null;
      const localName = draft.name.trim();
      if (draft.mode === 'create') {
        return createAdminUser({
          entraSub: draft.entraSub.trim(),
          email: draft.email.trim(),
          name: localName,
          role: draft.role as AdminUserDto['role'],
          scopeUnitId,
          status: draft.status as AdminUserDto['status'],
          locale: draft.locale || undefined,
        });
      }
      return updateAdminUser(draft.id!, {
        name: localName,
        role: draft.role as AdminUserDto['role'],
        scopeUnitId,
        status: draft.status as AdminUserDto['status'],
        locale: draft.locale || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDraft(null);
    },
    onError: (cause) => {
      setSaving({ error: isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeleting(null);
    },
    onError: (cause) => {
      setDeleting(null);
      setSaving({ error: isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN') });
    },
  });

  const openCreate = () => {
    setSaving(null);
    setDraft(emptyDraft());
  };

  const openEdit = (row: AdminUserDto) => {
    setSaving(null);
    setDraft({
      mode: 'edit',
      id: row.id,
      entraSub: '',
      email: row.email,
      name: row.name,
      role: row.role,
      scopeUnitId: row.scopeUnitId ?? '',
      status: row.status,
      locale: row.locale ?? 'zh-CN',
    });
  };

  const submit = () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setSaving({ error: t('admin.users.nameRequired') });
      return;
    }
    if (draft.mode === 'create' && (!draft.entraSub.trim() || !draft.email.trim())) {
      setSaving({ error: t('admin.users.requiredFields') });
      return;
    }
    setSaving(null);
    saveMutation.mutate();
  };

  const scopeName = (id: string) => units?.find((u) => u.id === id)?.name;

  const columns: ResponsiveTableColumn<AdminUserDto>[] = [
    { key: 'name', header: t('admin.users.name'), render: (u) => u.name },
    { key: 'email', header: t('admin.users.email'), render: (u) => u.email },
    { key: 'role', header: t('admin.users.role'), render: (u) => t(`roles.${u.role}`) },
    {
      key: 'status',
      header: t('admin.users.status'),
      render: (u) => t(`status.${u.status}`),
    },
    {
      key: 'scopeUnit',
      header: t('admin.users.scopeUnit'),
      render: (u) =>
        u.scopeUnitId ? scopeName(u.scopeUnitId) ?? u.scopeUnitId : t('admin.users.scopeNone'),
    },
    {
      key: 'createdAt',
      header: t('admin.users.createdAt'),
      render: (u) => formatDateTime(u.createdAt, locale),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('admin.users.title')}</Title1>
        <Button appearance="primary" onClick={openCreate}>
          {t('admin.users.newUser')}
        </Button>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <ResponsiveTable
          columns={columns}
          items={users ?? []}
          rowKey={(u) => u.id}
          emptyText={t('admin.users.empty')}
          actions={(u) => (
            <div className="flex gap-2">
              <Button size="small" appearance="secondary" onClick={() => openEdit(u)}>
                {t('admin.users.edit')}
              </Button>
              <Button
                size="small"
                appearance="secondary"
                onClick={() => {
                  setSaving(null);
                  setDeleting(u);
                }}
              >
                {t('admin.users.delete')}
              </Button>
            </div>
          )}
        />
      )}

      <Dialog open={draft !== null} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {draft?.mode === 'create' ? t('admin.users.createTitle') : t('admin.users.editTitle')}
            </DialogTitle>
            <DialogContent className="flex flex-col gap-4">
              {draft?.mode === 'create' && (
                <>
                  <Field label={t('admin.users.entraSub')} required>
                    <Input
                      value={draft.entraSub}
                      onChange={(_, d) => setDraft({ ...draft, entraSub: d.value })}
                      disabled={saveMutation.isPending}
                    />
                  </Field>
                  <Field label={t('admin.users.email')} required>
                    <Input
                      type="email"
                      value={draft.email}
                      onChange={(_, d) => setDraft({ ...draft, email: d.value })}
                      disabled={saveMutation.isPending}
                    />
                  </Field>
                </>
              )}
              <Field label={t('admin.users.name')} required>
                <Input
                  value={draft?.name ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, name: d.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.users.role')}>
                <Select
                  value={draft?.role ?? 'COLLECTOR'}
                  onChange={(_, d) => setDraft({ ...draft!, role: d.value })}
                  disabled={saveMutation.isPending}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('admin.users.scopeUnit')}>
                <Select
                  value={draft?.scopeUnitId ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, scopeUnitId: d.value })}
                  disabled={saveMutation.isPending}
                >
                  <option value="">{t('admin.users.scopeNone')}</option>
                  {(units ?? []).map((u: UnitDto) => (
                    <option key={u.id} value={u.id}>
                      {u.name}（{u.code}）
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('admin.users.status')}>
                <Select
                  value={draft?.status ?? 'ACTIVE'}
                  onChange={(_, d) => setDraft({ ...draft!, status: d.value })}
                  disabled={saveMutation.isPending}
                >
                  {USER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('admin.users.locale')}>
                <Input
                  value={draft?.locale ?? ''}
                  onChange={(_, d) => setDraft({ ...draft!, locale: d.value })}
                  disabled={saveMutation.isPending}
                />
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
            <DialogTitle>{t('admin.users.deleteTitle')}</DialogTitle>
            <DialogContent>
              <Text>{t('admin.users.deleteConfirm', { name: deleting?.name ?? '' })}</Text>
              {saving?.error && <Text className="text-red-600">{saving.error}</Text>}
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
                {deleteMutation.isPending ? t('common.loading') : t('admin.users.deleteConfirmBtn')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
