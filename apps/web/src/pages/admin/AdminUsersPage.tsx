import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Pencil, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { USER_ROLES, USER_STATUSES, type UserStatus } from '@otunlink/shared';

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
import { RefreshButton } from '../../components/RefreshButton';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
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

// 状态用「色块 + 文案」表达；normal/dead 之外还有未分配岗位的 PENDING。
const STATUS_TONE: Record<UserStatus, 'success' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  PENDING: 'neutral',
  DISABLED: 'danger',
};

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

  // 列表接口返回全量用户，分页与岗位/状态筛选都在客户端完成。
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 切筛选或切每页条数都要回到第 1 页，否则会停在已经不存在的页码上。
  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter, pageSize]);

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

  const openDelete = (row: AdminUserDto) => {
    setSaving(null);
    setDeleting(row);
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

  const filtered = useMemo(
    () =>
      (users ?? []).filter(
        (u) =>
          (!roleFilter || u.role === roleFilter) && (!statusFilter || u.status === statusFilter),
      ),
    [users, roleFilter, statusFilter],
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // 过滤后页码可能越界（例如停在第 3 页时切到只剩 1 页的岗位），先夹住再切页。
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );
  const filteredByUser = Boolean(roleFilter || statusFilter);

  const columns: DataTableColumn<AdminUserDto>[] = [
    {
      id: 'name',
      header: t('admin.users.name'),
      width: 200,
      minWidth: 120,
      hideable: false,
      cell: (u) => <span className="font-medium text-ink">{u.name}</span>,
    },
    { id: 'email', header: t('admin.users.email'), width: 240, minWidth: 160, cell: (u) => u.email },
    {
      id: 'role',
      header: t('admin.users.role'),
      width: 96,
      cell: (u) => t(`roles.${u.role}`),
    },
    {
      id: 'status',
      header: t('admin.users.status'),
      width: 96,
      cell: (u) => <Badge tone={STATUS_TONE[u.status]}>{t(`status.${u.status}`)}</Badge>,
    },
    {
      id: 'scopeUnit',
      header: t('admin.users.scopeUnit'),
      width: 160,
      cell: (u) =>
        u.scopeUnitId ? (scopeName(u.scopeUnitId) ?? u.scopeUnitId) : t('admin.users.scopeNone'),
    },
    {
      id: 'createdAt',
      header: t('admin.users.createdAt'),
      width: 168,
      cell: (u) => <span className="tabular-nums">{formatDateTime(u.createdAt, locale)}</span>,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('admin.users.title')}
        description={t('common.picker.count', { count: total.toLocaleString('zh-CN') })}
        actions={
          <Button variant="primary" onClick={openCreate}>
            {t('admin.users.newUser')}
          </Button>
        }
      />

      <DataTable
        tableId="admin-users"
        caption={t('admin.users.title')}
        columns={columns}
        rows={pageRows}
        rowKey={(u) => u.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<Users aria-hidden />}
            title={t('admin.users.empty')}
            description={filteredByUser ? t('common.noResults') : undefined}
          />
        }
        rowActions={(u) => {
          // 不能删自己：用 aria-disabled + 可聚焦，而不是 disabled ——
          // disabled 会把菜单项移出 Tab 序，读屏用户永远听不到「为什么不能删」。
          const isSelf = me?.id === u.id;
          const hintId = `self-delete-hint-${u.id}`;
          return (
            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${t('common.actions')} ${u.name}`}
                  >
                    <Ellipsis aria-hidden className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => openEdit(u)}>
                    <Pencil aria-hidden className="size-3.5" />
                    {t('admin.users.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-danger-600"
                    aria-disabled={isSelf || undefined}
                    aria-describedby={isSelf ? hintId : undefined}
                    onSelect={() => {
                      if (isSelf) return;
                      openDelete(u);
                    }}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    {t('admin.users.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {isSelf ? (
                <span id={hintId} className="sr-only">
                  {t('admin.users.deleteSelfHint')}
                </span>
              ) : null}
            </div>
          );
        }}
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        toolbar={
          <FilterBar
            extra={
              <>
                <Select
                  value={roleFilter}
                  onValueChange={setRoleFilter}
                  className="w-32"
                  aria-label={t('admin.users.role')}
                >
                  <option value="">{t('admin.users.roleAll')}</option>
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`roles.${r}`)}
                    </option>
                  ))}
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  className="w-32"
                  aria-label={t('admin.users.status')}
                >
                  <option value="">{t('admin.users.statusAll')}</option>
                  {USER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </Select>
              </>
            }
            right={<RefreshButton queryKey={['admin', 'users']} additionalKeys={[['admin', 'units']]} />}
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
