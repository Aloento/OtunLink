import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  listAuditLogs,
  type AuditLogDto,
  type AuditLogListQuery,
} from '../../api/admin';
import { RefreshButton } from '../../components/RefreshButton';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { DataTable, TablePager, type DataTableColumn } from '../../ui/data-table';
import { Empty } from '../../ui/empty';
import { Field } from '../../ui/field';
import { FilterBar } from '../../ui/filter-bar';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';

const DEFAULT_PAGE_SIZE = 20;

function toReadable(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

// 审计日志（AD03）：按 entityType/entityId/actorId/from/to 筛选查询。
// 服务端只接受上述精确筛选，没有全文搜索参数，所以工具条里的搜索框只筛「当前页」
// 已经加载的行（动作 / 实体类型 / 实体 ID），跨页检索请用右侧的精确筛选。
export function AuditLogsPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();

  const [filters, setFilters] = useState<AuditLogListQuery>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');

  // 切筛选或切每页条数都要回到第 1 页，否则会停在已经不存在的页码上。
  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'audit-logs', filters, page, pageSize],
    queryFn: () => listAuditLogs({ ...filters, page, size: pageSize }),
    placeholderData: keepPreviousData,
  });

  const set = (key: keyof AuditLogListQuery) => (value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));

  const total = data?.total ?? 0;
  // 服务端把 size 上限压到 50，分页区间按服务端实际返回的条数算，避免「第 51–100 条」却只有 50 行。
  const effectivePageSize = data?.size ?? pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  const query = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (!query) return items;
    return items.filter((log) =>
      [log.action, log.entityType, log.entityId].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [data, query]);

  const columns: DataTableColumn<AuditLogDto>[] = [
    {
      id: 'createdAt',
      header: t('admin.auditLogs.createdAt'),
      width: 168,
      hideable: false,
      cell: (log) => <span className="tabular-nums">{formatDateTime(log.createdAt, locale)}</span>,
    },
    { id: 'action', header: t('admin.auditLogs.action'), width: 180, cell: (log) => log.action },
    {
      id: 'entityType',
      header: t('admin.auditLogs.entityType'),
      width: 128,
      cell: (log) => log.entityType,
    },
    {
      id: 'entityId',
      header: t('admin.auditLogs.entityId'),
      width: 200,
      cell: (log) => <span title={log.entityId ?? undefined}>{log.entityId ?? '—'}</span>,
    },
    {
      id: 'userId',
      header: t('admin.auditLogs.userId'),
      width: 200,
      cell: (log) => log.userId ?? '—',
    },
    {
      id: 'after',
      header: t('admin.auditLogs.after'),
      width: 280,
      cell: (log) => {
        const text = toReadable(log.after);
        return <span title={text}>{text}</span>;
      },
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={t('admin.auditLogs.title')}
        description={t('admin.auditLogs.total', { total })}
      />

      <DataTable
        tableId="audit-logs"
        caption={t('admin.auditLogs.title')}
        columns={columns}
        rows={rows}
        rowKey={(log) => log.id}
        total={total}
        loading={isLoading}
        error={isError ? t('errors.UNKNOWN') : undefined}
        empty={
          <Empty
            icon={<ScrollText aria-hidden />}
            title={t('admin.auditLogs.empty')}
            description={query ? t('common.noResults') : undefined}
          />
        }
        stickyFirstColumn
        maxHeight="calc(100dvh - 15rem)"
        toolbar={
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('admin.auditLogs.searchPlaceholder')}
            extra={
              <>
                <Field label={t('admin.auditLogs.entityType')} srOnlyLabel className="w-40">
                  <Input
                    value={filters.entityType ?? ''}
                    placeholder={t('admin.auditLogs.entityType')}
                    onChange={(event) => set('entityType')(event.target.value)}
                  />
                </Field>
                <Field label={t('admin.auditLogs.entityId')} srOnlyLabel className="w-40">
                  <Input
                    value={filters.entityId ?? ''}
                    placeholder={t('admin.auditLogs.entityId')}
                    onChange={(event) => set('entityId')(event.target.value)}
                  />
                </Field>
                <Field label={t('admin.auditLogs.actorId')} srOnlyLabel className="w-40">
                  <Input
                    value={filters.actorId ?? ''}
                    placeholder={t('admin.auditLogs.actorId')}
                    onChange={(event) => set('actorId')(event.target.value)}
                  />
                </Field>
                <Field label={`${t('admin.auditLogs.createdAt')} ≥`} srOnlyLabel className="w-36">
                  <Input
                    type="date"
                    value={filters.from ?? ''}
                    onChange={(event) => set('from')(event.target.value)}
                  />
                </Field>
                <Field label={`${t('admin.auditLogs.createdAt')} ≤`} srOnlyLabel className="w-36">
                  <Input
                    type="date"
                    value={filters.to ?? ''}
                    onChange={(event) => set('to')(event.target.value)}
                  />
                </Field>
              </>
            }
            right={<RefreshButton queryKey={['admin', 'audit-logs']} />}
          />
        }
        footer={
          <TablePager
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={effectivePageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        }
      />
    </div>
  );
}
