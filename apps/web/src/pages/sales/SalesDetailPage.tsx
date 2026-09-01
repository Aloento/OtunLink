import {
  Button,
  Field,
  Input,
  Spinner,
  Text,
  Title1,
} from '@fluentui/react-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import {
  Permissions,
  hasPermission,
  type FileDto,
  type ReturnOrderDto,
  type SalesBatchAllocationDto,
  type SalesOrderDetailDto,
  type SalesOrderItemDto,
} from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { listItems } from '../../api/items';
import { createSalesReturn, listReturns } from '../../api/returns';
import { cancelSalesOrder, confirmSaleReceipt, getSalesOrder, sendSalesOrder, uploadSalePayment } from '../../api/sales';
import { listStockBatches } from '../../api/stock';
import { useSession } from '../../auth/SessionProvider';
import { ImageUpload } from '../../components/ImageUpload';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

// 销售单详情（状态机）：草稿可编辑/发送（FEFO 预览可覆盖），
// 已发送后可取消（回补）、零售方上传支付并确认收货。
export function SalesDetailPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['sales-orders', id],
    queryFn: () => getSalesOrder(id!),
    enabled: Boolean(id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['sales-orders', id] });
  };

  const [actionError, setActionError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => cancelSalesOrder(id!),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: (cause) => {
      setActionError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    },
  });
  const confirmMutation = useMutation({
    mutationFn: () => confirmSaleReceipt(id!),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: (cause) => {
      setActionError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    },
  });

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !order) return <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>;

  const isWarehouse = me?.role === 'WAREHOUSE';
  const isRetailer = me?.role === 'RETAILER';
  const canSend = isWarehouse && order.status === 'DRAFT';
  const canCancel = isWarehouse && (order.status === 'SENT' || order.status === 'PAYMENT_UPLOADED');
  const canPay = isRetailer && (order.status === 'SENT' || order.status === 'PAYMENT_UPLOADED');
  const canConfirm = isRetailer && order.status === 'PAYMENT_UPLOADED';

  const itemColumns: ResponsiveTableColumn<SalesOrderItemDto>[] = [
    { key: 'itemName', header: t('sales.itemName'), render: (l) => l.itemName ?? l.itemId },
    { key: 'spec', header: t('inventory.spec'), render: (l) => l.spec ?? '—' },
    { key: 'qty', header: t('sales.qty'), render: (l) => l.qty },
    { key: 'listPrice', header: t('sales.listPrice'), render: (l) => l.listPrice ?? '—' },
    { key: 'price', header: t('sales.price'), render: (l) => l.price ?? '—' },
    { key: 'lineTotal', header: t('sales.lineTotal'), render: (l) => l.lineTotal ?? '—' },
  ];

  const allocColumns: ResponsiveTableColumn<SalesBatchAllocationDto>[] = [
    { key: 'itemName', header: t('sales.itemName'), render: (l) => l.itemName ?? l.itemId },
    { key: 'batchNo', header: t('sales.batchNo'), render: (l) => l.batchNo ?? l.batchId },
    { key: 'expiry', header: t('sales.expiry'), render: (l) => l.expiryDate ?? '—' },
    { key: 'qty', header: t('sales.allocatedQty'), render: (l) => l.qty },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">
          {t('sales.detail')} · {order.salesNo}
        </Title1>
        <div className="flex items-center gap-2">
          {canSend && (
            <Link to={`/sales/${order.id}/edit`}>
              <Button appearance="secondary">{t('sales.editTitle')}</Button>
            </Link>
          )}
          {canCancel && (
            <Button
              appearance="secondary"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (window.confirm(t('sales.cancelConfirm'))) cancelMutation.mutate();
              }}
            >
              {t('sales.cancelOrder')}
            </Button>
          )}
          {canConfirm && (
            <Button
              appearance="primary"
              disabled={confirmMutation.isPending}
              onClick={() => {
                if (window.confirm(t('sales.confirmReceiptConfirm'))) confirmMutation.mutate();
              }}
            >
              {t('sales.confirmReceipt')}
            </Button>
          )}
        </div>
      </div>

      {actionError && <Text className="text-red-600">{actionError}</Text>}

      <div className="grid grid-cols-1 gap-3 rounded border border-neutral-200 p-4 text-sm sm:grid-cols-2">
        <div>
          <span className="text-neutral-500">{t('sales.source')}：</span>
          {t(`sales.sources.${order.source}`)}
        </div>
        <div>
          <span className="text-neutral-500">{t('sales.status')}：</span>
          {t(`sales.statuses.${order.status}`)}
        </div>
        <div>
          <span className="text-neutral-500">{t('sales.seller')}：</span>
          {order.sellerUnitName ?? order.sellerUnitId}
        </div>
        <div>
          <span className="text-neutral-500">{t('sales.buyer')}：</span>
          {order.buyerUnitName ?? order.buyerUnitId}
        </div>
        <div>
          <span className="text-neutral-500">{t('sales.deliveryMethod')}：</span>
          {t(`sales.deliveryMethods.${order.deliveryMethod}`)}
        </div>
        {order.deliveryAddress && (
          <div>
            <span className="text-neutral-500">{t('sales.deliveryAddress')}：</span>
            {order.deliveryAddress}
          </div>
        )}
        {order.carrier && (
          <div>
            <span className="text-neutral-500">{t('sales.carrier')}：</span>
            {order.carrier}
          </div>
        )}
        {order.trackingNo && (
          <div>
            <span className="text-neutral-500">{t('sales.trackingNo')}：</span>
            {order.trackingNo}
          </div>
        )}
        <div>
          <span className="text-neutral-500">{t('sales.freight')}：</span>
          {order.freight ?? '0'}
        </div>
        <div>
          <span className="text-neutral-500">{t('sales.discountPercent')}：</span>
          {order.discountPercent}
        </div>
        <div>
          <span className="text-neutral-500">{t('sales.totalAmount')}：</span>
          {order.totalAmount === null ? '—' : `${order.totalAmount} ${order.currency}`}
        </div>
        <div>
          <span className="text-neutral-500">{t('sales.createdAt')}：</span>
          {order.createdAt ? formatDateTime(order.createdAt, locale) : '—'}
        </div>
        {order.sentAt && (
          <div>
            <span className="text-neutral-500">{t('sales.sentAt')}：</span>
            {formatDateTime(order.sentAt, locale)}
          </div>
        )}
        {order.confirmedAt && (
          <div>
            <span className="text-neutral-500">{t('sales.confirmedAt')}：</span>
            {formatDateTime(order.confirmedAt, locale)}
          </div>
        )}
        {order.remark && (
          <div className="sm:col-span-2">
            <span className="text-neutral-500">{t('sales.remark')}：</span>
            {order.remark}
          </div>
        )}
      </div>

      <div>
        <Text as="h2" weight="semibold" size={400}>
          {t('sales.items')}
        </Text>
        <ResponsiveTable
          columns={itemColumns}
          items={order.items}
          rowKey={(l) => l.id}
          emptyText={t('sales.noItems')}
        />
      </div>

      {order.allocations.length > 0 && (
        <div>
          <Text as="h2" weight="semibold" size={400}>
            {t('sales.allocations')}
          </Text>
          <ResponsiveTable
            columns={allocColumns}
            items={order.allocations}
            rowKey={(l) => l.id}
            emptyText={t('sales.noAllocations')}
          />
        </div>
      )}

      {canSend && <SendPanel order={order} onSent={refresh} />}

      {canPay && (
        <PaymentPanel
          order={order}
          onUploaded={() => {
            refresh();
            setActionError(null);
          }}
        />
      )}

      {order.payment && (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
          <Text as="h2" weight="semibold" size={400}>
            {t('sales.payment')}
          </Text>
          <div className="text-sm">
            <div>
              <span className="text-neutral-500">{t('sales.paymentAmount')}：</span>
              {order.payment.amount} {order.payment.currency}
            </div>
            {order.payment.methodNote && (
              <div>
                <span className="text-neutral-500">{t('sales.paymentMethod')}：</span>
                {order.payment.methodNote}
              </div>
            )}
            <div>
              <span className="text-neutral-500">{t('sales.uploadedAt')}：</span>
              {order.payment.uploadedAt ? formatDateTime(order.payment.uploadedAt, locale) : '—'}
            </div>
            {order.payment.refundNote && (
              <div className="text-red-600">
                <span className="text-neutral-500">{t('sales.refundNote')}：</span>
                {order.payment.refundNote}
              </div>
            )}
          </div>
        </div>
      )}

      <AfterSaleSection order={order} />
    </div>
  );
}

/** 售后面板：展示该销售单的售后记录；零售方可在已发送/已上传支付/已确认后发起退货。 */
function AfterSaleSection({ order }: { order: SalesOrderDetailDto }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { me } = useSession();
  const queryClient = useQueryClient();

  const { data: returns, isLoading } = useQuery({
    queryKey: ['return-orders', 'list', 'SALES', order.id],
    queryFn: () => listReturns({ sourceType: 'SALES', salesOrderId: order.id, page: 1, size: 20 }),
    staleTime: 15_000,
  });

  const canCreate =
    hasPermission(me?.role, Permissions.AFTER_SALE_CREATE) &&
    (!me?.scopeUnitId || me.scopeUnitId === order.buyerUnitId) &&
    (order.status === 'SENT' ||
      order.status === 'PAYMENT_UPLOADED' ||
      order.status === 'CONFIRMED');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['return-orders', 'list', 'SALES', order.id] });
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <Text as="h2" weight="semibold" size={400}>
        {t('sales.afterSale')}
      </Text>
      {isLoading ? (
        <Spinner size="tiny" label={t('common.loading')} />
      ) : (returns?.items.length ?? 0) === 0 ? (
        <Text size={200} className="text-neutral-500">
          {t('sales.noAfterSale')}
        </Text>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          {returns?.items.map((r) => (
            <Link key={r.id} to={`/returns/${r.id}`} className="flex flex-wrap items-center gap-2 text-blue-600 hover:underline">
              <span>{r.returnNo}</span>
              <span className="text-neutral-500">{t(`returns.statuses.${r.status}`)}</span>
              <span className="text-neutral-500">{r.createdAt ? formatDateTime(r.createdAt, locale) : '—'}</span>
            </Link>
          ))}
        </div>
      )}
      {canCreate && <SalesReturnForm order={order} onCreated={refresh} />}
    </div>
  );
}

/** 发起售后表单：行级退货数量（≤ 实收未退）+ 行原因 + 照片（files 管线）。 */
function SalesReturnForm({
  order,
  onCreated,
}: {
  order: SalesOrderDetailDto;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<Record<string, { qty: string; reason: string }>>(() =>
    Object.fromEntries(order.items.map((item) => [item.id, { qty: '', reason: '' }])),
  );
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<FileDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const items = order.items
      .map((line) => {
        const row = lines[line.id] ?? { qty: '', reason: '' };
        return { line, qty: row.qty.trim(), reason: row.reason.trim() };
      })
      .filter((row) => row.qty !== '');
    if (items.length === 0) {
      setError(t('sales.afterSaleLineRequired'));
      return;
    }
    for (const row of items) {
      const value = Number(row.qty);
      if (!Number.isFinite(value) || value <= 0) {
        setError(t('errors.VALIDATION_ERROR'));
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await createSalesReturn(order.id, {
        items: items.map((row) => ({
          salesOrderItemId: row.line.id,
          qty: row.qty,
          reason: row.reason || null,
        })),
        reason: reason.trim() || null,
        photoFileIds: photos.map((f) => f.id),
      });
      setLines(Object.fromEntries(order.items.map((item) => [item.id, { qty: '', reason: '' }])));
      setReason('');
      setPhotos([]);
      onCreated();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-100 p-3">
      <Text weight="semibold">{t('sales.startAfterSale')}</Text>
      <div className="flex flex-col gap-1">
        {order.items.map((line) => {
          const row = lines[line.id] ?? { qty: '', reason: '' };
          return (
            <div key={line.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-40 truncate text-sm">{line.itemName ?? line.itemId}</span>
              <Input
                size="small"
                type="number"
                min={0}
                style={{ maxWidth: 120 }}
                value={row.qty}
                onChange={(_, d) =>
                  setLines((prev) => ({ ...prev, [line.id]: { ...row, qty: d.value } }))
                }
                placeholder={t('sales.afterSaleQtyPlaceholder')}
              />
              <Input
                size="small"
                style={{ maxWidth: 260 }}
                value={row.reason}
                onChange={(_, d) =>
                  setLines((prev) => ({ ...prev, [line.id]: { ...row, reason: d.value } }))
                }
                placeholder={t('sales.afterSaleLineReason')}
              />
            </div>
          );
        })}
      </div>
      <Input
        value={reason}
        onChange={(_, d) => setReason(d.value)}
        placeholder={t('sales.afterSaleReason')}
      />
      <ImageUpload value={photos} onChange={setPhotos} />
      {error && <Text className="text-red-600">{error}</Text>}
      <div>
        <Button appearance="primary" disabled={saving} onClick={() => void submit()}>
          {saving ? <Spinner size="tiny" /> : t('sales.startAfterSale')}
        </Button>
      </div>
    </div>
  );
}

/** 发送面板：FEFO 建议预览（按到期日排序），数量可覆盖为指定批次；留空则完全走 FEFO。 */
function SendPanel({ order, onSent }: { order: SalesOrderDetailDto; onSent: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [manual, setManual] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['stock', 'batches', order.sellerUnitId],
    queryFn: () => listStockBatches({ unitId: order.sellerUnitId }),
    enabled: Boolean(order.sellerUnitId),
    staleTime: 30_000,
  });

  const suggestions = useMemo(() => {
    const moved: Record<string, Record<string, string>> = {};
    for (const line of order.items) {
      const rows = (batches?.items ?? [])
        .filter((b) => b.itemId === line.itemId)
        .sort((a, b) => {
          const ea = a.expiryDate ?? '\uffff';
          const eb = b.expiryDate ?? '\uffff';
          return ea.localeCompare(eb) || a.batchId.localeCompare(b.batchId);
        });
      const plan: Record<string, string> = {};
      let remaining = Number(line.qty);
      for (const row of rows) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(row.qty));
        if (take > 0) plan[row.batchId] = String(take);
        remaining -= take;
      }
      moved[line.itemId] = plan;
    }
    return moved;
  }, [batches, order.items]);

  const buildAllocations = (): { itemId: string; batchId: string; qty: string }[] | null => {
    const filled = Object.entries(manual).filter(([, qty]) => qty.trim() !== '');
    if (filled.length === 0) return [];
    const byItem = new Map<string, number>();
    for (const [batchId, qty] of filled) {
      const batch = (batches?.items ?? []).find((b) => b.batchId === batchId);
      if (!batch) continue;
      byItem.set(batch.itemId, (byItem.get(batch.itemId) ?? 0) + Number(qty));
    }
    for (const line of order.items) {
      const sum = byItem.get(line.itemId) ?? 0;
      if (sum !== Number(line.qty)) return null;
    }
    return filled.map(([batchId, qty]) => ({ itemId: String(manualItemId(batchId)), batchId, qty: qty.trim() }));
  };

  const manualItemId = (batchId: string): string => {
    const batch = (batches?.items ?? []).find((b) => b.batchId === batchId);
    return batch?.itemId ?? '';
  };

  const send = async () => {
    const allocations = buildAllocations();
    if (allocations === null) {
      setError(t('sales.errors.allocationMismatch'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendSalesOrder(order.id, {
        allocations,
        carrier: carrier.trim() || null,
        trackingNo: trackingNo.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['sales-orders', order.id] });
      onSent();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <Text as="h2" weight="semibold" size={400}>
        {t('sales.fefoPreview')}
      </Text>
      <Text size={200} className="text-neutral-500">
        {t('sales.fefoHint')}
      </Text>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={t('sales.carrier')}>
          <Input
            value={carrier}
            onChange={(_, d) => setCarrier(d.value)}
            placeholder={t('sales.carrierPlaceholder')}
          />
        </Field>
        <Field label={t('sales.trackingNo')}>
          <Input
            value={trackingNo}
            onChange={(_, d) => setTrackingNo(d.value)}
            placeholder={t('sales.trackingNoPlaceholder')}
          />
        </Field>
      </div>
      {isLoading ? (
        <Spinner size="tiny" label={t('common.loading')} />
      ) : (
        order.items.map((line) => {
          const plan = suggestions[line.itemId] ?? {};
          const batchRows = (batches?.items ?? [])
            .filter((b) => b.itemId === line.itemId)
            .sort((a, b) => {
              const ea = a.expiryDate ?? '\uffff';
              const eb = b.expiryDate ?? '\uffff';
              return ea.localeCompare(eb) || a.batchId.localeCompare(b.batchId);
            });
          return (
            <div key={line.id} className="flex flex-col gap-1 rounded border border-neutral-100 p-2">
              <Text weight="semibold">
                {line.itemName ?? line.itemId} × {line.qty}
              </Text>
              {batchRows.length === 0 ? (
                <Text size={200} className="text-amber-600">
                  {t('sales.errors.noBatchStock')}
                </Text>
              ) : (
                batchRows.map((row) => (
                  <div key={row.batchId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-40 truncate">{row.batchNo ?? row.batchId}</span>
                    <span className="text-neutral-500">
                      {row.expiryDate ?? '—'} · {t('inventory.qty')} {row.qty}
                    </span>
                    <span className="text-neutral-400">
                      {t('sales.fefoSuggest')} {plan[row.batchId] ?? '0'}
                    </span>
                    <Input
                      size="small"
                      type="number"
                      min={0}
                      style={{ maxWidth: 120 }}
                      value={manual[row.batchId] ?? ''}
                      onChange={(_, d) => setManual((prev) => ({ ...prev, [row.batchId]: d.value }))}
                      placeholder={t('sales.manualQty')}
                    />
                  </div>
                ))
              )}
            </div>
          );
        })
      )}
      {error && <Text className="text-red-600">{error}</Text>}
      <div className="flex items-center gap-2">
        <Button appearance="primary" disabled={sending} onClick={() => void send()}>
          {sending ? <Spinner size="tiny" /> : t('sales.send')}
        </Button>
        <Button appearance="secondary" disabled={sending} onClick={() => setManual({})}>
          {t('sales.fefoAuto')}
        </Button>
        <Text size={200} className="text-neutral-500">
          {t('sales.sendConfirm')}
        </Text>
      </div>
    </div>
  );
}

/** 支付面板：零售方上传支付凭证（amount/备注/凭证图片 → files 管线预上传）。 */
function PaymentPanel({ order, onUploaded }: { order: SalesOrderDetailDto; onUploaded: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(order.totalAmount ?? '0');
  const [methodNote, setMethodNote] = useState('');
  const [proofs, setProofs] = useState<FileDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    setSaving(true);
    setError(null);
    try {
      await uploadSalePayment(order.id, {
        amount,
        methodNote: methodNote.trim() || null,
        proofFileId: proofs[0]?.id ?? null,
      });
      onUploaded();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
      <Text as="h2" weight="semibold" size={400}>
        {t('sales.uploadPayment')}
      </Text>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('sales.paymentAmount')} required>
          <Input type="number" min={0} value={amount} onChange={(_, d) => setAmount(d.value)} />
        </Field>
        <Field label={t('sales.paymentMethod')}>
          <Input value={methodNote} onChange={(_, d) => setMethodNote(d.value)} />
        </Field>
        <Field label={t('sales.paymentProof')} className="sm:col-span-2">
          <ImageUpload value={proofs} onChange={setProofs} />
        </Field>
      </div>
      {error && <Text className="text-red-600">{error}</Text>}
      <div className="flex items-center gap-2">
        <Button appearance="primary" disabled={saving} onClick={() => void upload()}>
          {saving ? <Spinner size="tiny" /> : t('sales.uploadPayment')}
        </Button>
      </div>
    </div>
  );
}
