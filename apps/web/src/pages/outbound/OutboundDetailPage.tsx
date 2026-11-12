import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type OutboundOrderItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { deleteOutboundOrder, getOutboundOrder, postOutboundOrder } from '../../api/outbound';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { FileImage } from '../../components/FileImage';
import { ItemLink } from '../../components/ItemLink';
import { RefreshButton } from '../../components/RefreshButton';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { PageHeader } from '../../ui/page-header';
import { Spinner } from '../../ui/spinner';

// 出库单详情：批次分配结果 + 草稿过账（扣减库存 / 写台账流水）。
export function OutboundDetailPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['outbound-orders', id],
    queryFn: () => getOutboundOrder(id),
  });

  const canPost = hasPermission(me?.role, Permissions.STOCK_WRITE);

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      await postOutboundOrder(id);
      await refreshAfterWrite(queryClient);
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteOutboundOrder(id);
      await refreshAfterWrite(queryClient);
      navigate('/outbound');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.NOT_FOUND')}
        </p>
        <Button asChild variant="secondary">
          <Link to="/outbound">{t('outbound.back')}</Link>
        </Button>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('outbound.outboundNo'), data.outboundNo],
    [t('outbound.type'), t(`outbound.types.${data.type}`)],
    [t('outbound.warehouse'), data.warehouseName ?? data.warehouseUnitId],
    [t('outbound.counterparty'), data.counterpartyName ?? data.counterpartyUnitId ?? '—'],
    [t('outbound.status'), t(`outbound.statuses.${data.status}`)],
    [t('outbound.createdAt'), data.createdAt ? formatDateTime(data.createdAt, locale) : '—'],
    [t('outbound.postedAt'), data.postedAt ? formatDateTime(data.postedAt, locale) : '—'],
  ];
  if (data.type === 'LOSS') {
    rows.splice(4, 0, [t('outbound.lossReason'), data.lossReason ?? '—']);
  }

  const columns: ResponsiveTableColumn<OutboundOrderItemDto>[] = [
    {
      key: 'itemName',
      header: t('outbound.itemName'),
      render: (item) => <ItemLink itemId={item.itemId} itemName={item.itemName} />,
    },
    {
      key: 'batchNo',
      header: t('outbound.batchNo'),
      render: (item) =>
        item.batchNo ?? (
          <span title={t('outbound.fefoHint')}>
            <Badge tone="brand">{t('outbound.fefo')}</Badge>
          </span>
        ),
    },
    { key: 'qty', header: t('outbound.qty'), align: 'end', render: (item) => item.qty },
    {
      key: 'unitCost',
      header: t('outbound.unitCost'),
      align: 'end',
      render: (item) => item.unitCost ?? '—',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${t('outbound.detail')} · ${data.outboundNo}`}
        actions={
          <>
            <RefreshButton queryKey={['outbound-orders', id]} />
            <Button asChild variant="secondary">
              <Link to="/outbound">{t('outbound.back')}</Link>
            </Button>
            {data.status === 'DRAFT' && canPost && (
              <>
                <Button asChild variant="secondary">
                  <Link to={`/outbound/${id}/edit`}>{t('outbound.edit')}</Link>
                </Button>
                <Button variant="primary" loading={posting} onClick={() => void handlePost()}>
                  {t('outbound.post')}
                </Button>
                <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(true)}>
                  {t('outbound.delete')}
                </Button>
              </>
            )}
          </>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      {data.status === 'DRAFT' && canPost && (
        <p className="text-sm text-warning-700">{t('outbound.postConfirm')}</p>
      )}

      <Card>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-ink-subtle">{label}</dt>
              <dd className="text-sm wrap-break-word text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {data.remark && <p className="text-sm text-ink-soft">{data.remark}</p>}

      {data.type === 'LOSS' && data.photoFileIds.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-ink">{t('outbound.lossPhotos')}</h2>
          <div className="flex flex-wrap gap-3">
            {data.photoFileIds.map((fileId, index) => (
              <FileImage
                key={fileId}
                fileId={fileId}
                className="h-24 w-24 rounded object-cover"
                // 后端只回 fileId：用「报损照片 + 序号」当替代文本，别把 UUID 读给屏幕阅读器。
                alt={`${t('outbound.lossPhotos')} ${index + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink">{t('outbound.items')}</h2>
        <ResponsiveTable
          columns={columns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('outbound.noItems')}
          label={t('outbound.items')}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('outbound.delete')}
        description={<p className="text-sm text-ink-muted">{t('outbound.deleteConfirm')}</p>}
        confirmLabel={t('outbound.delete')}
        tone="danger"
        busy={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
