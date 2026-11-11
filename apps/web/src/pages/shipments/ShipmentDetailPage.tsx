import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type ShipmentItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { refreshAfterWrite } from '../../api/queryClient';
import { deleteShipment, getShipment, sendShipment, startCounting } from '../../api/shipments';
import { useSession } from '../../auth/SessionProvider';
import { ItemLink } from '../../components/ItemLink';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { ConfirmReceiptPanel } from '../../components/shipments/ConfirmReceiptPanel';
import { ReturnCreatePanel } from '../../components/shipments/ReturnCreatePanel';
import { ShipmentCountPanel } from '../../components/shipments/ShipmentCountPanel';
import { ShipmentReviewsSection } from '../../components/shipments/ShipmentReviewsSection';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { unitLabel } from '../../i18n/units';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { PageHeader } from '../../ui/page-header';
import { Spinner } from '../../ui/spinner';

// 发货单详情：字段 + 物流单号 + 清单（效期列 + 实收/差异高亮）
// + 转交/编辑按钮 + 点货面板 + 差异修订审批。
export function ShipmentDetailPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shipments', id],
    queryFn: () => getShipment(id),
  });

  const canEdit = hasPermission(me?.role, Permissions.SHIPMENTS_CREATE);
  const canSend = hasPermission(me?.role, Permissions.SHIPMENTS_TRANSFER);
  const canCount =
    hasPermission(me?.role, Permissions.COUNTING_WRITE) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.receiverUnitId);
  const canSubmitReview =
    hasPermission(me?.role, Permissions.REVIEWS_SUBMIT) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.receiverUnitId);
  const canApproveReview =
    hasPermission(me?.role, Permissions.REVIEWS_APPROVE) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.shipperUnitId);
  const canConfirmReceipt =
    hasPermission(me?.role, Permissions.INBOUND_CONFIRM) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.receiverUnitId);
  const canCreateReturn =
    hasPermission(me?.role, Permissions.SHIPMENT_RETURNS_CREATE) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.receiverUnitId);

  const refresh = () => refreshAfterWrite(queryClient);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      await sendShipment(id);
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setSending(false);
    }
  };

  const handleStartCounting = async () => {
    setStarting(true);
    setError(null);
    try {
      await startCounting(id);
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteShipment(id);
      await refreshAfterWrite(queryClient);
      navigate('/shipments');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
      setDeleting(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-3">
        {/* 失败态同样要有页面级标题：否则该状态下整页没有 <h1>，按标题导航的用户无从定位。 */}
        <PageHeader title={t('shipments.detail')} className="w-full" />
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.NOT_FOUND')}
        </p>
        <Button asChild variant="secondary">
          <Link to="/shipments">{t('shipments.back')}</Link>
        </Button>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('shipments.shipmentNo'), data.shipmentNo],
    [
      t('shipments.route'),
      `${data.shipperName ?? data.shipperUnitId} → ${data.receiverName ?? data.receiverUnitId}`,
    ],
    [t('shipments.status'), t(`shipments.statuses.${data.status}`)],
    [t('shipments.boxes'), String(data.boxesCount)],
    [t('shipments.currency'), data.currency],
    [t('shipments.expectedArrivalDate'), data.expectedArrivalDate ?? '—'],
    [t('shipments.sentAt'), data.sentAt ? formatDateTime(data.sentAt, locale) : '—'],
    [t('shipments.createdAt'), data.createdAt ? formatDateTime(data.createdAt, locale) : '—'],
  ];

  const itemColumns: ResponsiveTableColumn<ShipmentItemDto>[] = [
    {
      key: 'name',
      header: t('shipments.itemName'),
      render: (item) => <ItemLink itemId={item.itemId} itemName={item.name} />,
    },
    {
      key: 'spec',
      header: t('shipments.itemSpec'),
      render: (item) => unitLabel(t, item.spec, item.minSaleUnit),
    },
    {
      key: 'qty',
      header: t('shipments.expectedQty'),
      render: (item) => <span className="tabular-nums">{item.expectedQty}</span>,
    },
    {
      key: 'actual',
      header: t('shipments.counting.actualQty'),
      render: (item) =>
        item.actualQty === null ? (
          <span className="text-ink-subtle">—</span>
        ) : itemDiff(item) === 0 ? (
          <span className="tabular-nums">{item.actualQty}</span>
        ) : (
          <span className="font-semibold tabular-nums text-danger-600">
            {item.actualQty}
            <Badge tone="danger" className="ms-2">
              {itemDiff(item) > 0 ? '+' : ''}
              {itemDiff(item)}
            </Badge>
          </span>
        ),
    },
    {
      key: 'price',
      header: t('shipments.unitPrice'),
      render: (item) =>
        item.unitPrice === null ? '—' : <span className="tabular-nums">{item.unitPrice}</span>,
    },
    {
      key: 'productionDate',
      header: t('shipments.productionDate'),
      render: (item) => item.productionDate ?? '—',
    },
    { key: 'expiryDate', header: t('shipments.expiryDate'), render: (item) => item.expiryDate ?? '—' },
    { key: 'note', header: t('shipments.lineNote'), render: (item) => item.lineNote ?? '—' },
  ];

  const differences = data.items.filter((item) => item.actualQty !== null && itemDiff(item) !== 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${t('shipments.detail')} · ${data.shipmentNo}`}
        actions={
          <>
            <RefreshButton queryKey={['shipments', id]} />
            <Button asChild variant="secondary">
              <Link to="/shipments">{t('shipments.back')}</Link>
            </Button>
            {data.status === 'DRAFT' && canEdit && (
              <Button asChild variant="primary">
                <Link to={`/shipments/${id}/edit`}>{t('shipments.edit')}</Link>
              </Button>
            )}
            {data.status === 'DRAFT' && canSend && (
              <Button variant="primary" loading={sending} onClick={() => void handleSend()}>
                {t('shipments.send')}
              </Button>
            )}
            {data.status === 'DRAFT' && canEdit && (
              <Button variant="secondary" loading={deleting} onClick={() => setConfirmDelete(true)}>
                {t('shipments.delete')}
              </Button>
            )}
            {data.status === 'SENT' && canCount && (
              <Button variant="primary" loading={starting} onClick={() => void handleStartCounting()}>
                {t('shipments.counting.start')}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      {differences.length > 0 && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-3">
          <p className="text-sm font-medium text-danger-600">
            {t('shipments.counting.hasDifference', { count: differences.length })}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line py-1">
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="min-w-0 text-end text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {data.remark && <p className="text-sm text-ink-soft">{data.remark}</p>}

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink">{t('shipments.trackings')}</h2>
        {data.trackings.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('shipments.noTrackings')}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {data.trackings.map((tr) => (
              <div key={tr.id} className="min-w-0 rounded-lg border border-line bg-surface p-3">
                <div className="font-medium text-ink">
                  {tr.carrier} · {tr.trackingNo}
                </div>
                {tr.note && <div className="text-sm text-ink-muted">{tr.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink">{t('shipments.items')}</h2>
        <ResponsiveTable
          columns={itemColumns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('shipments.noItems')}
          label={t('shipments.items')}
        />
      </div>

      <ShipmentCountPanel
        shipment={data}
        canCount={canCount}
        canSubmitReview={canSubmitReview}
        onRefresh={refresh}
      />

      <ConfirmReceiptPanel shipment={data} canConfirm={canConfirmReceipt} onRefresh={refresh} />

      <ReturnCreatePanel shipment={data} canCreate={canCreateReturn} onRefresh={refresh} />

      <ShipmentReviewsSection
        shipment={data}
        canSubmitReview={canSubmitReview}
        canApproveReview={canApproveReview}
        onRefresh={refresh}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('shipments.deleteConfirm')}
        tone="danger"
        busy={deleting}
        onConfirm={() => {
          setConfirmDelete(false);
          void handleDelete();
        }}
      />
    </div>
  );
}

function itemDiff(item: ShipmentItemDto): number {
  return Number(item.actualQty) - Number(item.expectedQty);
}
