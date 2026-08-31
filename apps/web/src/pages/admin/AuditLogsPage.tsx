import {
  Button,
  Input,
  Spinner,
  Text,
  Title1,
} from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  listAuditLogs,
  type AuditLogDto,
  type AuditLogListQuery,
} from '../../api/admin';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

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
      render: (l) => new Date(l.createdAt).toLocaleString(),
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
      <Title1 as="h1">{t('admin.auditLogs.title')}</Title1>

      <div className="flex flex-wrap gap-3">
        <Input
          value={filters.entityType ?? ''}
          placeholder={t('admin.auditLogs.entityType')}
          onChange={(_, d) => set('entityType')(d.value)}
          className="min-w-52"
        />
        <Input
          value={filters.entityId ?? ''}
          placeholder={t('admin.auditLogs.entityId')}
          onChange={(_, d) => set('entityId')(d.value)}
          className="min-w-52"
        />
        <Input
          value={filters.actorId ?? ''}
          placeholder={t('admin.auditLogs.actorId')}
          onChange={(_, d) => set('actorId')(d.value)}
          className="min-w-52"
        />
        <Input
          type="date"
          value={filters.from ?? ''}
          onChange={(_, d) => {
            set('from')(d.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          value={filters.to ?? ''}
          onChange={(_, d) => {
            set('to')(d.value);
            setPage(1);
          }}
        />
        <Button appearance="secondary" onClick={() => setPage(1)}>
          {t('common.refresh')}
        </Button>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            items={data?.items ?? []}
            rowKey={(l) => l.id}
            emptyText={t('admin.auditLogs.empty')}
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('admin.auditLogs.total', { total })}</span>
            <div className="flex items-center gap-2">
              <Button
                size="small"
                appearance="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                size="small"
                appearance="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
