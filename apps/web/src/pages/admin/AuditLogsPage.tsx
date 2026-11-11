import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  listAuditLogs,
  type AuditLogDto,
  type AuditLogListQuery,
} from '../../api/admin';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Spinner } from '../../ui/spinner';

const PAGE_SIZE = 20;

function toReadable(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

// 审计日志（AD03）：按 entityType/entityId/actorId/from/to 筛选查询。
export function AuditLogsPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const [filters, setFilters] = useState<AuditLogListQuery>({});
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit-logs', filters, page],
    queryFn: () => listAuditLogs({ ...filters, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: ResponsiveTableColumn<AuditLogDto>[] = [
    {
      key: 'createdAt',
      header: t('admin.auditLogs.createdAt'),
      render: (l) => formatDateTime(l.createdAt, locale),
    },
    { key: 'action', header: t('admin.auditLogs.action'), render: (l) => l.action },
    { key: 'entityType', header: t('admin.auditLogs.entityType'), render: (l) => l.entityType },
    {
      key: 'entityId',
      header: t('admin.auditLogs.entityId'),
      render: (l) => l.entityId ?? '—',
    },
    { key: 'userId', header: t('admin.auditLogs.userId'), render: (l) => l.userId ?? '—' },
    { key: 'after', header: t('admin.auditLogs.after'), render: (l) => toReadable(l.after) },
  ];

  const set = (key: keyof AuditLogListQuery) => (value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('admin.auditLogs.title')} />

      <div className="flex flex-wrap items-center gap-3">
        <Field label={t('admin.auditLogs.entityType')} srOnlyLabel className="w-full sm:w-52">
          <Input
            value={filters.entityType ?? ''}
            placeholder={t('admin.auditLogs.entityType')}
            onChange={(event) => set('entityType')(event.target.value)}
          />
        </Field>
        <Field label={t('admin.auditLogs.entityId')} srOnlyLabel className="w-full sm:w-52">
          <Input
            value={filters.entityId ?? ''}
            placeholder={t('admin.auditLogs.entityId')}
            onChange={(event) => set('entityId')(event.target.value)}
          />
        </Field>
        <Field label={t('admin.auditLogs.actorId')} srOnlyLabel className="w-full sm:w-52">
          <Input
            value={filters.actorId ?? ''}
            placeholder={t('admin.auditLogs.actorId')}
            onChange={(event) => set('actorId')(event.target.value)}
          />
        </Field>
        <Field
          label={`${t('admin.auditLogs.createdAt')} ≥`}
          srOnlyLabel
          className="w-full sm:w-40"
        >
          <Input
            type="date"
            value={filters.from ?? ''}
            onChange={(event) => {
              set('from')(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field
          label={`${t('admin.auditLogs.createdAt')} ≤`}
          srOnlyLabel
          className="w-full sm:w-40"
        >
          <Input
            type="date"
            value={filters.to ?? ''}
            onChange={(event) => {
              set('to')(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        <RefreshButton queryKey={['admin', 'audit-logs']} />
      </div>

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
            rowKey={(l) => l.id}
            emptyText={t('admin.auditLogs.empty')}
            label={t('admin.auditLogs.title')}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            totalLabel={t('admin.auditLogs.total', { total })}
          />
        </>
      )}
    </div>
  );
}
