import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type InboundOrderItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { deleteInbound, getInbound, postInbound } from '../../api/inbound';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { ItemLink } from '../../components/ItemLink';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { RefreshButton } from '../../components/RefreshButton';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Facts } from '../../ui/facts';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { PageHeader } from '../../ui/page-header';
import { Spinner } from '../../ui/spinner';

// 入库单详情：批次清单 + 草稿过账（建档批次 / 写库存台账）。
export function InboundDetailPage() {
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
    queryKey: ['inbound-orders', id],
    queryFn: () => getInbound(id),
  });

  const canPost = hasPermission(me?.role, Permissions.INBOUND_CONFIRM);

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      await postInbound(id);
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
      await deleteInbound(id);
      await refreshAfterWrite(queryClient);
      navigate('/inbound');
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
          <Link to="/inbound">{t('inbound.back')}</Link>
        </Button>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('inbound.inboundNo'), data.inboundNo],
    [t('inbound.sourceType'), t(`inbound.sourceTypes.${data.sourceType}`)],
    [t('inbound.shipmentNo'), data.shipmentNo ?? '—'],
    [t('inbound.warehouse'), data.warehouseName ?? data.warehouseUnitId],
    [t('inbound.counterparty'), data.counterpartyName ?? data.counterpartyUnitId ?? '—'],
    [t('inbound.status'), t(`inbound.statuses.${data.status}`)],
    [t('inbound.createdAt'), data.createdAt ? formatDateTime(data.createdAt, locale) : '—'],
    [t('inbound.postedAt'), data.postedAt ? formatDateTime(data.postedAt, locale) : '—'],
  ];

  const columns: ResponsiveTableColumn<InboundOrderItemDto>[] = [
    {
      key: 'name',
      header: t('inbound.itemName'),
      render: (item) => <ItemLink itemId={item.itemId} itemName={item.itemName} />,
    },
    {
      key: 'batchNo',
      header: t('inbound.batchNo'),
      render: (item) => item.batchNo ?? <span className="text-ink-subtle">—</span>,
    },
    { key: 'qty', header: t('inbound.qty'), align: 'end', render: (item) => item.qty },
    {
      key: 'unitCost',
      header: t('inbound.unitCost'),
      align: 'end',
      render: (item) => item.unitCost,
    },
    {
      key: 'productionDate',
      header: t('inbound.productionDate'),
      render: (item) => item.productionDate ?? '—',
    },
    { key: 'expiryDate', header: t('inbound.expiryDate'), render: (item) => item.expiryDate ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${t('inbound.detail')} · ${data.inboundNo}`}
        actions={
          <>
            <RefreshButton queryKey={['inbound-orders', id]} />
            <Button asChild variant="secondary">
              <Link to="/inbound">{t('inbound.back')}</Link>
            </Button>
            {data.status === 'DRAFT' && canPost && (
              <>
                <Button variant="primary" loading={posting} onClick={() => void handlePost()}>
                  {t('inbound.post')}
                </Button>
                <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(true)}>
                  {t('inbound.delete')}
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
        <p className="text-sm text-warning-700">{t('inbound.postConfirm')}</p>
      )}

      <Card>
        <Facts items={rows} />
      </Card>

      {data.remark && <p className="text-sm text-ink-soft">{data.remark}</p>}

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{t('inbound.items')}</h2>
        <ResponsiveTable
          columns={columns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('inbound.noItems')}
          label={t('inbound.items')}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('inbound.delete')}
        description={<p className="text-sm text-ink-muted">{t('inbound.deleteConfirm')}</p>}
        confirmLabel={t('inbound.delete')}
        tone="danger"
        busy={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
