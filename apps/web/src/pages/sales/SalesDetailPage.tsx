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

import type {
  FileDto,
  SalesBatchAllocationDto,
  SalesOrderDetailDto,
  SalesOrderItemDto,
} from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { listItems } from '../../api/items';
import { cancelSalesOrder, confirmSaleReceipt, getSalesOrder, sendSalesOrder, uploadSalePayment } from '../../api/sales';
import { listStockBatches } from '../../api/stock';
import { useSession } from '../../auth/SessionProvider';
import { ImageUpload } from '../../components/ImageUpload';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

// 销售单详情（ck-09a §5.5 状态机）：草稿可编辑/发送（FEFO 预览可覆盖），
// 已发送后可取消（回补）、零售方上传支付并确认收货。
export function SalesDetailPage() {
  const { t } = useTranslation();
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
          {order.createdAt}
        </div>
        {order.sentAt && (
          <div>
            <span className="text-neutral-500">{t('sales.sentAt')}：</span>
            {order.sentAt}
          </div>
        )}
        {order.confirmedAt && (
          <div>
            <span className="text-neutral-500">{t('sales.confirmedAt')}：</span>
            {order.confirmedAt}
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
              {order.payment.uploadedAt ?? '—'}
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
    </div>
  );
}

/** 发送面板：FEFO 建议预览（按到期日排序），数量可覆盖为指定批次；留空则完全走 FEFO。 */
function SendPanel({ order, onSent }: { order: SalesOrderDetailDto; onSent: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [manual, setManual] = useState<Record<string, string>>({});
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
      await sendSalesOrder(order.id, { allocations });
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
