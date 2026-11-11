import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { USER_ROLES, USER_STATUSES } from '@otunlink/shared';

import { useSession } from '../../auth/SessionProvider';

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
import { refreshAfterWrite } from '../../api/queryClient';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { RefreshButton } from '../../components/RefreshButton';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
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
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

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

// 破坏性确认的初始焦点落在「取消」上，避免回车误删。
const autofocusCancel = { 'data-autofocus': '' } as Record<string, string>;

// 用户管理（AD01）：管理员为用户分配岗位与数据范围。
export function AdminUsersPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me, reload } = useSession();
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
    onSuccess: async (saved) => {
      // 先本地更新缓存，避免保存后列表“不立刻更新”。
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (prev) => {
        if (!prev) return prev;
        const index = prev.findIndex((u) => u.id === saved.id);
        if (index === -1) return [saved, ...prev];
        const next = [...prev];
        next[index] = saved;
        return next;
      });
      await refreshAfterWrite(queryClient);
      // 改的是自己的账号：/auth/me 的岗位 / 数据范围 / 语言也会变，必须重新拉取会话。
      if (saved.id === me?.id) await reload();
      setDraft(null);
    },
    onError: (cause) => {
      setSaving({ error: isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: async (res) => {
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (prev) =>
        prev?.filter((u) => u.id !== res.id),
      );
      await refreshAfterWrite(queryClient);
      setSaving(null);
      setDeleting(null);
    },
    onError: (cause) => {
      // 关闭对话框会让错误信息随关闭动画一闪而过，这里保留对话框以显示具体原因。
      setSaving({ error: isApiError(cause) ? cause.message : t('errors.UNKNOWN') });
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
      <PageHeader
        title={t('admin.users.title')}
        actions={
          <>
            <RefreshButton queryKey={['admin', 'users']} additionalKeys={[['admin', 'units']]} />
            <Button variant="primary" onClick={openCreate}>
              {t('admin.users.newUser')}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      ) : (
        <ResponsiveTable
          columns={columns}
          items={users ?? []}
          rowKey={(u) => u.id}
          emptyText={t('admin.users.empty')}
          label={t('admin.users.title')}
          actions={(u) => {
            // 不能删自己：用 aria-disabled + 可聚焦，而不是 disabled ——
            // disabled 会把按钮移出 Tab 序，读屏用户永远听不到「为什么不能删」。
            const isSelf = me?.id === u.id;
            const hintId = `self-delete-hint-${u.id}`;
            return (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`${t('admin.users.edit')} ${u.name}`}
                  onClick={() => openEdit(u)}
                >
                  {t('admin.users.edit')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-disabled={isSelf || undefined}
                  aria-describedby={isSelf ? hintId : undefined}
                  className="aria-disabled:opacity-50"
                  aria-label={`${t('admin.users.delete')} ${u.name}`}
                  onClick={() => {
                    if (isSelf) return;
                    setSaving(null);
                    setDeleting(u);
                  }}
                >
                  {t('admin.users.delete')}
                </Button>
                {isSelf && (
                  <span id={hintId} className="sr-only">
                    {t('admin.users.deleteSelfHint')}
                  </span>
                )}
              </div>
            );
          }}
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
            <DialogTitle>
              {draft?.mode === 'create' ? t('admin.users.createTitle') : t('admin.users.editTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              {draft?.mode === 'create' && (
                <>
                  <Field label={t('admin.users.entraSub')} required>
                    <Input
                      {...{ 'data-autofocus': '' }}
                      value={draft.entraSub}
                      onChange={(event) => setDraft({ ...draft, entraSub: event.target.value })}
                      disabled={saveMutation.isPending}
                    />
                  </Field>
                  <Field label={t('admin.users.email')} required>
                    <Input
                      type="email"
                      value={draft.email}
                      onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                      disabled={saveMutation.isPending}
                    />
                  </Field>
                </>
              )}
              <Field label={t('admin.users.name')} required>
                <Input
                  {...{ 'data-autofocus': draft?.mode === 'edit' ? '' : undefined }}
                  value={draft?.name ?? ''}
                  onChange={(event) => setDraft({ ...draft!, name: event.target.value })}
                  disabled={saveMutation.isPending}
                />
              </Field>
              <Field label={t('admin.users.role')}>
                <Select
                  value={draft?.role ?? 'COLLECTOR'}
                  onValueChange={(value) => setDraft({ ...draft!, role: value })}
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
                  onValueChange={(value) => setDraft({ ...draft!, scopeUnitId: value })}
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
                  onValueChange={(value) => setDraft({ ...draft!, status: value })}
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
                  onChange={(event) => setDraft({ ...draft!, locale: event.target.value })}
                  disabled={saveMutation.isPending}
                />
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
            setSaving(null);
          }
        }}
        closeLabel={t('common.close')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.users.deleteConfirm', { name: deleting?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {saving?.error && (
              <p role="alert" className="text-sm text-danger-600">
                {saving.error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              {...autofocusCancel}
              variant="secondary"
              onClick={() => {
                setDeleting(null);
                setSaving(null);
              }}
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
              {t('admin.users.deleteConfirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
