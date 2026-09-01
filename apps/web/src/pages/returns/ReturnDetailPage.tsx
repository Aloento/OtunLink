import { Button, Body1, Input, Spinner, Text, Textarea, Title1 } from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type ReturnOrderItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
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
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

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
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['return-orders', id],
    queryFn: () => getReturn(id),
    staleTime: 15_000,
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['return-orders', id] });

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
    if (!window.confirm(t('returns.deleteConfirm'))) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteReturn(id);
      await queryClient.invalidateQueries({ queryKey: ['return-orders'] });
      navigate('/returns');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
      setDeleting(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Text className="text-red-600">{t('errors.NOT_FOUND')}</Text>
        <Link to="/returns">
          <Button appearance="secondary">{t('returns.back')}</Button>
        </Link>
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
    { key: 'name', header: t('returns.itemName'), render: (item) => item.itemName ?? item.itemId },
    { key: 'qty', header: t('returns.qty'), render: (item) => item.qty },
    ...(isSales
      ? [
          {
            key: 'receivedQty',
            header: t('returns.receivedQty'),
            render: (item: ReturnOrderItemDto) => item.receivedQty ?? '—',
          } as ResponsiveTableColumn<ReturnOrderItemDto>,
          {
            key: 'pendingQc',
            header: t('returns.pendingQc'),
            render: (item: ReturnOrderItemDto) =>
              item.pendingQc ? (
                <span className="text-amber-600">{t('returns.pendingQcYes')}</span>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">
          {t('returns.detail')} · {data.returnNo}
        </Title1>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button appearance="secondary" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? <Spinner size="tiny" /> : t('returns.delete')}
            </Button>
          )}
          <Link to="/returns">
            <Button appearance="secondary">{t('returns.back')}</Button>
          </Link>
        </div>
      </div>

      {error && <Text className="text-red-600">{error}</Text>}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between border-b border-neutral-200 py-1">
            <dt className="text-sm text-neutral-500">{label}</dt>
            <dd className="text-sm font-medium text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>

      {data.reason && <Body1>{data.reason}</Body1>}

      {data.photoFileIds.length > 0 && (
        <div className="flex flex-col gap-2">
          <Text as="h2" weight="semibold" size={400}>
            {t('returns.photos')}
          </Text>
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
        <Text as="h2" weight="semibold" size={400}>
          {t('returns.items')}
        </Text>
        <ResponsiveTable
          columns={columns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('returns.noItems')}
        />
      </div>

      {data.status === 'PENDING' && canHandleShipment && (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
          <Textarea
            placeholder={
              note.trim()
                ? undefined
                : t('returns.acceptNotePlaceholder')
            }
            value={note}
            onChange={(_e, d) => setNote(d.value)}
            resize="vertical"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button appearance="primary" disabled={busy} onClick={() => void handleAccept()}>
              {busy ? <Spinner size="tiny" /> : t('returns.accept')}
            </Button>
            <Button appearance="secondary" disabled={busy} onClick={() => void handleReject()}>
              {t('returns.reject')}
            </Button>
          </div>
        </div>
      )}

      {isSales && data.status === 'REQUESTED' && canHandleSales && (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
          <Textarea
            placeholder={
              note.trim()
                ? undefined
                : t('returns.approveNotePlaceholder')
            }
            value={note}
            onChange={(_e, d) => setNote(d.value)}
            resize="vertical"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button appearance="primary" disabled={busy} onClick={() => void handleApproveSales()}>
              {busy ? <Spinner size="tiny" /> : t('returns.approve')}
            </Button>
            <Button appearance="secondary" disabled={busy} onClick={() => void handleRejectSales()}>
              {t('returns.reject')}
            </Button>
          </div>
        </div>
      )}

      {isSales && data.status === 'APPROVED' && canHandleSales && (
        <ReceivePanel returnId={id} items={data.items} onReceived={refresh} />
      )}

      {isSales && data.status === 'RETURNED' && data.processedNote && (
        <Text className="text-sm text-neutral-500">{t('returns.processedNote')}：{data.processedNote}</Text>
      )}
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
      onReceived();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <Text as="h2" weight="semibold" size={400}>
        {t('returns.receive')}
      </Text>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-48 truncate">{item.itemName ?? item.itemId}</span>
            <span className="text-neutral-500">
              {t('returns.receiveMax', { qty: item.qty })}
            </span>
            <Input
              size="small"
              type="number"
              min={0}
              max={Number(item.qty)}
              style={{ maxWidth: 120 }}
              value={received[item.id] ?? ''}
              onChange={(_, d) => setReceived((prev) => ({ ...prev, [item.id]: d.value }))}
              aria-label={t('returns.receivedQty')}
            />
          </div>
        ))}
      </div>
      {error && <Text className="text-red-600">{error}</Text>}
      <div className="flex items-center gap-2">
        <Button appearance="primary" disabled={saving} onClick={() => void submit()}>
          {saving ? <Spinner size="tiny" /> : t('returns.receiveSubmit')}
        </Button>
      </div>
    </div>
  );
}
