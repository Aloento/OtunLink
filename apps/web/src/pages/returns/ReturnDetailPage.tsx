import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type ReturnOrderItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { refreshAfterWrite } from '../../api/queryClient';
import {
  acceptReturn,
  approveSalesReturn,
  deleteReturn,
  getReturn,
  receiveSalesReturn,
  rejectReturn,
} from '../../api/returns';
import { useSession } from '../../auth/SessionProvider';
import { FileImage } from '../../components/FileImage';
import { ItemLink } from '../../components/ItemLink';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Spinner } from '../../ui/spinner';
import { Textarea } from '../../ui/textarea';

// 破坏性确认的初始焦点要落在「取消」上（避免回车误删）。
const autofocusCancel = { 'data-autofocus': '' } as Record<string, string>;

// 退货单详情：发货退货（集货方 PENDING → accept/reject）；
// 零售售后（仓库 REQUESTED → approve/reject，APPROVED → receive 闭环回补）。
export function ReturnDetailPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['return-orders', id],
    queryFn: () => getReturn(id),
  });

  const isSales = data?.sourceType === 'SALES';

  const canHandleShipment =
    !isSales &&
    hasPermission(me?.role, Permissions.SHIPMENT_RETURNS_HANDLE) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.toUnitId);

  const canHandleSales =
    isSales &&
    hasPermission(me?.role, Permissions.AFTER_SALE_RECEIVE) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.toUnitId);

  // 仅创建方可删除未处理的退货单：发货退货 PENDING（仓库发起）/ 零售售后 REQUESTED（零售发起）。
  const canDelete =
    (data?.status === 'PENDING' &&
      !isSales &&
      hasPermission(me?.role, Permissions.SHIPMENT_RETURNS_CREATE)) ||
    (data?.status === 'REQUESTED' &&
      isSales &&
      hasPermission(me?.role, Permissions.AFTER_SALE_CREATE));

  const refresh = () => refreshAfterWrite(queryClient);

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptReturn(id, note.trim() || null);
      setNote('');
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!note.trim()) {
      setError(t('returns.rejectNotePlaceholder'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectReturn(id, note.trim());
      setNote('');
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSales = async () => {
    setBusy(true);
    setError(null);
    try {
      await approveSalesReturn(id, note.trim() || null);
      setNote('');
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  const handleRejectSales = async () => {
    if (!note.trim()) {
      setError(t('returns.rejectNotePlaceholder'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectReturn(id, note.trim());
      setNote('');
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteReturn(id);
      await refreshAfterWrite(queryClient);
      navigate('/returns');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-3">
        {/* 失败态同样要有页面级标题：否则该状态下整页没有 <h1>。 */}
        <PageHeader title={t('returns.detail')} />
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.NOT_FOUND')}
        </p>
        <Button asChild variant="secondary" className="self-start">
          <Link to="/returns">{t('returns.back')}</Link>
        </Button>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('returns.returnNo'), data.returnNo],
    [t('returns.sourceType'), t(`returns.sources.${data.sourceType}`)],
    [t('returns.shipmentNo'), data.shipmentNo ?? '—'],
    [t('returns.salesOrderNo'), data.salesOrderNo ?? '—'],
    [
      t('returns.route'),
      `${data.fromUnitName ?? data.fromUnitId} → ${data.toUnitName ?? data.toUnitId}`,
    ],
    [t('returns.status'), t(`returns.statuses.${data.status}`)],
    [t('returns.createdAt'), data.createdAt ? formatDateTime(data.createdAt, locale) : '—'],
    [t('returns.processedAt'), data.processedAt ? formatDateTime(data.processedAt, locale) : '—'],
    ...(data.processedNote ? [[t('returns.processedNote'), data.processedNote] as [string, string]] : []),
  ];

  const columns: ResponsiveTableColumn<ReturnOrderItemDto>[] = [
    {
      key: 'name',
      header: t('returns.itemName'),
      render: (item) => <ItemLink itemId={item.itemId} itemName={item.itemName} />,
    },
    {
      key: 'qty',
      header: t('returns.qty'),
      render: (item) => <span className="tabular-nums">{item.qty}</span>,
    },
    ...(isSales
      ? [
          {
            key: 'receivedQty',
            header: t('returns.receivedQty'),
            render: (item: ReturnOrderItemDto) =>
              item.receivedQty === null ? (
                '—'
              ) : (
                <span className="tabular-nums">{item.receivedQty}</span>
              ),
          } as ResponsiveTableColumn<ReturnOrderItemDto>,
          {
            key: 'pendingQc',
            header: t('returns.pendingQc'),
            render: (item: ReturnOrderItemDto) =>
              item.pendingQc ? (
                <span className="text-warning-700">{t('returns.pendingQcYes')}</span>
              ) : (
                '—'
              ),
          } as ResponsiveTableColumn<ReturnOrderItemDto>,
        ]
      : []),
    { key: 'reason', header: t('returns.lineReason'), render: (item) => item.reason ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${t('returns.detail')} · ${data.returnNo}`}
        actions={
          <>
            <RefreshButton queryKey={['return-orders', id]} />
            {canDelete && (
              <Button
                variant="danger"
                loading={deleting}
                onClick={() => setConfirmDelete(true)}
              >
                {t('returns.delete')}
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link to="/returns">{t('returns.back')}</Link>
            </Button>
          </>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line py-1"
          >
            <dt className="shrink-0 text-sm text-ink-muted">{label}</dt>
            <dd className="min-w-0 text-end text-sm font-medium wrap-break-word text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {data.reason && <p className="text-sm text-ink-soft">{data.reason}</p>}

      {data.photoFileIds.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-ink">{t('returns.photos')}</h2>
          <div className="flex flex-wrap gap-3">
            {data.photoFileIds.map((fileId) => (
              <FileImage
                key={fileId}
                fileId={fileId}
                className="h-24 w-24 rounded object-cover"
                alt={fileId}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink">{t('returns.items')}</h2>
        <ResponsiveTable
          columns={columns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('returns.noItems')}
          label={t('returns.items')}
        />
      </div>

      {data.status === 'PENDING' && canHandleShipment && (
        <Card className="flex flex-col gap-3">
          <Textarea
            aria-label={t('returns.processedNote')}
            placeholder={t('returns.acceptNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" loading={busy} onClick={() => void handleAccept()}>
              {t('returns.accept')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void handleReject()}>
              {t('returns.reject')}
            </Button>
          </div>
        </Card>
      )}

      {isSales && data.status === 'REQUESTED' && canHandleSales && (
        <Card className="flex flex-col gap-3">
          <Textarea
            aria-label={t('returns.processedNote')}
            placeholder={t('returns.approveNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" loading={busy} onClick={() => void handleApproveSales()}>
              {t('returns.approve')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void handleRejectSales()}>
              {t('returns.reject')}
            </Button>
          </div>
        </Card>
      )}

      {isSales && data.status === 'APPROVED' && canHandleSales && (
        <ReceivePanel returnId={id} items={data.items} onReceived={refresh} />
      )}

      {isSales && data.status === 'RETURNED' && data.processedNote && (
        <p className="text-sm text-ink-muted">
          {t('returns.processedNote')}：{data.processedNote}
        </p>
      )}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        closeLabel={t('common.close')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('returns.delete')}</DialogTitle>
            <DialogDescription>{t('returns.deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              {...autofocusCancel}
              variant="secondary"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void handleDelete()}>
              {t('returns.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 退回收货面板：仓库录入各明细实收数量（0..申请数量），提交后回补库存闭环。 */
function ReceivePanel({
  returnId,
  items,
  onReceived,
}: {
  returnId: string;
  items: ReturnOrderItemDto[];
  onReceived: () => void;
}) {
  const { t } = useTranslation();
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.qty])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const lines = items.map((item) => ({ returnItemId: item.id, receivedQty: received[item.id] ?? '' }));
    for (const line of lines) {
      const value = Number(line.receivedQty);
      if (!Number.isFinite(value) || value < 0) {
        setError(t('errors.VALIDATION_ERROR'));
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await receiveSalesReturn(returnId, { items: lines });
      setSaving(false);
      onReceived();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">{t('returns.receive')}</h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 truncate text-ink-soft">{item.itemName ?? item.itemId}</span>
            <span className="text-ink-muted">{t('returns.receiveMax', { qty: item.qty })}</span>
            <Input
              type="number"
              min={0}
              max={Number(item.qty)}
              className="w-28 min-w-0"
              value={received[item.id] ?? ''}
              onChange={(event) =>
                setReceived((prev) => ({ ...prev, [item.id]: event.target.value }))
              }
              aria-label={`${t('returns.receivedQty')} · ${item.itemName ?? item.itemId}`}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('returns.receiveSubmit')}
        </Button>
      </div>
    </Card>
  );
}
