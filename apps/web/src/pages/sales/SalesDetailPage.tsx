import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  Permissions,
  hasPermission,
  type FileDto,
  type ReturnOrderDto,
  type SalesBatchAllocationDto,
  type SalesOrderDetailDto,
  type SalesOrderItemDto,
} from '@otunlink/shared';

import { errorI18nKey, extractSalesLineErrors, isApiError, type ExtractedSalesLineError } from '../../api/http';
import { ItemLink } from '../../components/ItemLink';
import { createSalesReturn, listReturns } from '../../api/returns';
import { cancelSalesOrder, confirmSaleReceipt, deleteSalesOrder, getSalesOrder, sendSalesOrder, uploadSalePayment } from '../../api/sales';
import { listStockBatches } from '../../api/stock';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { FileImage } from '../../components/FileImage';
import { RefreshButton } from '../../components/RefreshButton';
import { ImageUpload } from '../../components/ImageUpload';
import { useLocale } from '../../i18n/LocaleProvider';
import { formatDateTime } from '../../i18n/format';
import { unitLabel } from '../../i18n/units';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { Button } from '../../ui/button';
import { Card, CardHeader } from '../../ui/card';
import { Checkbox } from '../../ui/checkbox';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { Facts } from '../../ui/facts';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Spinner } from '../../ui/spinner';
import { usePickedLines } from './pickingState';

// 销售单详情（状态机）：草稿可编辑/发送（FEFO 预览可覆盖），
// 已发送后可取消（回补）、零售方上传支付并确认收货。
export function SalesDetailPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['sales-orders', id],
    queryFn: () => getSalesOrder(id!),
    enabled: Boolean(id),
  });

  const refresh = () => {
    void refreshAfterWrite(queryClient);
  };

  const [actionError, setActionError] = useState<string | null>(null);
  // 删除 / 取消 / 确认收款这三种一次性动作统一走 <ConfirmDialog>：
  // 删除是不可撤销的破坏性动作（tone="danger"，初始焦点在「取消」），
  // 取消与确认收款只改变状态机状态，保持主操作色。
  const [confirm, setConfirm] = useState<'delete' | 'cancel' | 'receipt' | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => deleteSalesOrder(id!),
    onSuccess: () => {
      setActionError(null);
      void refreshAfterWrite(queryClient);
      navigate('/sales');
    },
    onError: (cause) => {
      setActionError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
    },
  });

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

  // 拣货勾选：仓库取货现场用，存在本机浏览器（见 pickingState.ts），不参与单据状态机。
  const picking = usePickedLines(id);

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !order)
    return (
      <p role="alert" className="text-sm text-danger-600">
        {t('errors.UNKNOWN')}
      </p>
    );

  const canSend = hasPermission(me?.role, Permissions.SALES_SEND) && order.status === 'DRAFT';
  const canCancel =
    hasPermission(me?.role, Permissions.SALES_CANCEL) &&
    (order.status === 'SENT' || order.status === 'PAYMENT_UPLOADED');
  const canPay =
    hasPermission(me?.role, Permissions.SALES_PAYMENT) &&
    (order.status === 'SENT' || order.status === 'PAYMENT_UPLOADED');
  const canConfirm =
    hasPermission(me?.role, Permissions.SALES_CONFIRM_RECEIPT) && order.status === 'PAYMENT_UPLOADED';

  // 只统计本单现存的行：清单改过之后，旧勾选不会虚增计数。
  const pickedCount = order.items.filter((l) => picking.picked.has(l.id)).length;

  // 组合商品归组：同一 bundleItemId 的多行折叠成一行摘要，供取货时看整包内容。
  const bundleSummaries = (() => {
    const map = new Map<string, { bundleItemId: string; bundleItemName: string; contents: SalesOrderItemDto[] }>();
    for (const line of order.items) {
      if (!line.bundleItemId) continue;
      const entry = map.get(line.bundleItemId) ?? {
        bundleItemId: line.bundleItemId,
        bundleItemName: line.bundleItemName ?? line.bundleItemId,
        contents: [],
      };
      entry.contents.push(line);
      map.set(line.bundleItemId, entry);
    }
    return [...map.values()];
  })();

  const itemColumns: ResponsiveTableColumn<SalesOrderItemDto>[] = [
    {
      key: 'itemName',
      header: t('sales.itemName'),
      render: (l) => (
        <div className="flex flex-col">
          {l.bundleItemName && (
            <span className="text-xs text-ink-subtle">
              {t('items.bundleBadge')}：{l.bundleItemName}
            </span>
          )}
          <ItemLink itemId={l.itemId} itemName={l.itemName} />
        </div>
      ),
    },
    {
      key: 'spec',
      header: t('sales.spec'),
      render: (l) => unitLabel(t, l.spec, l.minSaleUnit),
    },
    {
      key: 'qty',
      header: t('sales.qty'),
      // 数量/金额列由 align 统一右对齐：表头与内容同时靠右，逐行比较时个位对齐。
      align: 'end',
      render: (l) => l.qty,
    },
    {
      key: 'listPrice',
      header: t('sales.listPrice'),
      align: 'end',
      render: (l) =>
        l.listPrice === null ? '—' : `${l.listPrice} ${l.listPriceCurrency ?? order.currency}`,
    },
    {
      key: 'price',
      header: t('sales.price'),
      align: 'end',
      render: (l) => (l.price === null ? '—' : `${l.price} ${l.priceCurrency}`),
    },
    {
      key: 'lineTotal',
      header: t('sales.lineTotal'),
      align: 'end',
      render: (l) => l.lineTotal ?? '—',
    },
    // 末列：拣货勾选。逐行勾掉已取到的货，买到哪件一眼可见。
    {
      key: 'picked',
      header: t('sales.picked'),
      render: (l) => (
        <Checkbox
          id={`picked-${l.id}`}
          checked={picking.picked.has(l.id)}
          onChange={() => picking.toggle(l.id)}
          // 逐行勾选框：可访问名称必须带上物品名，否则整列都是同一个「已拣货」。
          aria-label={`${t('sales.picked')} ${l.itemName ?? l.itemId}`}
        />
      ),
    },
  ];

  const allocColumns: ResponsiveTableColumn<SalesBatchAllocationDto>[] = [
    {
      key: 'itemName',
      header: t('sales.itemName'),
      render: (l) => <ItemLink itemId={l.itemId} itemName={l.itemName} />,
    },
    { key: 'batchNo', header: t('sales.batchNo'), render: (l) => l.batchNo ?? l.batchId },
    { key: 'expiry', header: t('sales.expiry'), render: (l) => l.expiryDate ?? '—' },
    {
      key: 'qty',
      header: t('sales.allocatedQty'),
      align: 'end',
      render: (l) => l.qty,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${t('sales.detail')} · ${order.salesNo}`}
        actions={
          <>
            <RefreshButton queryKey={['sales-orders', id]} />
            {canSend && (
              <Button asChild variant="secondary">
                <Link to={`/sales/${order.id}/edit`}>{t('sales.editTitle')}</Link>
              </Button>
            )}
            {canSend && (
              <Button
                variant="secondary"
                loading={deleteMutation.isPending}
                onClick={() => setConfirm('delete')}
              >
                {t('sales.delete')}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="secondary"
                loading={cancelMutation.isPending}
                onClick={() => setConfirm('cancel')}
              >
                {t('sales.cancelOrder')}
              </Button>
            )}
            {canConfirm && (
              <Button
                variant="primary"
                loading={confirmMutation.isPending}
                onClick={() => setConfirm('receipt')}
              >
                {t('sales.confirmReceipt')}
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <p role="alert" className="text-sm text-danger-600">
          {actionError}
        </p>
      )}

      <Facts
        boxed
        items={[
          [t('sales.source'), t(`sales.sources.${order.source}`)],
          [t('sales.status'), t(`sales.statuses.${order.status}`)],
          [t('sales.seller'), order.sellerUnitName ?? order.sellerUnitId],
          [t('sales.buyer'), order.buyerUnitName ?? order.buyerUnitId],
          [t('sales.deliveryMethod'), t(`sales.deliveryMethods.${order.deliveryMethod}`)],
          ...(order.deliveryAddress
            ? ([[t('sales.deliveryAddress'), order.deliveryAddress]] as Array<[string, string]>)
            : []),
          ...(order.carrier ? ([[t('sales.carrier'), order.carrier]] as Array<[string, string]>) : []),
          ...(order.trackingNo
            ? ([[t('sales.trackingNo'), order.trackingNo]] as Array<[string, string]>)
            : []),
          [t('sales.freight'), order.freight ?? '0'],
          [t('sales.discountPercent'), order.discountPercent],
          [t('sales.currency'), order.currency],
          [
            t('sales.totalAmount'),
            order.totalAmount === null ? '—' : `${order.totalAmount} ${order.currency}`,
          ],
          [t('sales.createdAt'), order.createdAt ? formatDateTime(order.createdAt, locale) : '—'],
          ...(order.sentAt
            ? ([[t('sales.sentAt'), formatDateTime(order.sentAt, locale)]] as Array<[string, string]>)
            : []),
          ...(order.confirmedAt
            ? ([[t('sales.confirmedAt'), formatDateTime(order.confirmedAt, locale)]] as Array<
                [string, string]
              >)
            : []),
          ...(order.remark ? ([[t('sales.remark'), order.remark]] as Array<[string, string]>) : []),
        ]}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-[13px] font-semibold text-ink">{t('sales.items')}</h2>
            {order.items.length > 0 && (
              <span className="text-xs text-ink-subtle tabular-nums">
                {t('sales.pickedCount', { done: pickedCount, total: order.items.length })}
              </span>
            )}
          </div>
          {/* 勾选是本地状态，明确给一个清空入口：重打一份清单或换一单取货时不必逐行点掉。 */}
          {pickedCount > 0 && (
            <Button size="sm" variant="subtle" onClick={picking.clear}>
              {t('sales.clearPicked')}
            </Button>
          )}
        </div>
        {bundleSummaries.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-muted p-3">
            {bundleSummaries.map((bundle) => (
              <p key={bundle.bundleItemId} className="text-xs text-ink-soft">
                {t('sales.bundleSummary', {
                  name: bundle.bundleItemName,
                  contents: bundle.contents
                    .map((c) => `${c.itemName ?? c.itemId} ×${c.qty}`)
                    .join('、'),
                })}
              </p>
            ))}
          </div>
        )}
        <ResponsiveTable
          columns={itemColumns}
          items={order.items}
          rowKey={(l) => l.id}
          emptyText={t('sales.noItems')}
          label={t('sales.items')}
        />
        {order.items.length > 0 && (
          <p className="text-xs text-ink-subtle">{t('sales.pickedHint')}</p>
        )}
      </div>

      {order.allocations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-ink">{t('sales.allocations')}</h2>
          <ResponsiveTable
            columns={allocColumns}
            items={order.allocations}
            rowKey={(l) => l.id}
            emptyText={t('sales.noAllocations')}
            label={t('sales.allocations')}
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
        <Card className="flex flex-col gap-2">
          <CardHeader title={t('sales.payment')} className="mb-0" />
          <Facts
            items={[
              [
                t('sales.paymentAmount'),
                `${order.payment.amount} ${order.payment.currency}`,
              ],
              ...(order.payment.methodNote
                ? ([[t('sales.paymentMethod'), order.payment.methodNote]] as Array<[string, string]>)
                : []),
              [
                t('sales.uploadedAt'),
                order.payment.uploadedAt ? formatDateTime(order.payment.uploadedAt, locale) : '—',
              ],
              ...(order.payment.refundNote
                ? ([[t('sales.refundNote'), order.payment.refundNote]] as Array<[string, string]>)
                : []),
            ]}
          />
          {order.payment.proofFileId && (
            <div className="mt-2 flex items-center gap-3">
              <span className="shrink-0 text-[13px] text-ink-muted">
                {t('sales.paymentProofImage')}
              </span>
              <FileImage
                fileId={order.payment.proofFileId}
                className="h-24 w-24 rounded-lg object-cover"
                alt={t('sales.paymentProofImage')}
              />
            </div>
          )}
        </Card>
      )}

      <AfterSaleSection order={order} />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(next) => !next && setConfirm(null)}
        title={
          confirm === 'delete'
            ? t('sales.deleteConfirm')
            : confirm === 'cancel'
              ? t('sales.cancelConfirm')
              : t('sales.confirmReceiptConfirm')
        }
        confirmLabel={
          confirm === 'delete'
            ? t('sales.delete')
            : confirm === 'cancel'
              ? t('sales.cancelOrder')
              : t('sales.confirmReceipt')
        }
        tone={confirm === 'delete' ? 'danger' : 'primary'}
        busy={
          confirm === 'delete'
            ? deleteMutation.isPending
            : confirm === 'cancel'
              ? cancelMutation.isPending
              : confirmMutation.isPending
        }
        onConfirm={() => {
          const kind = confirm;
          setConfirm(null);
          if (kind === 'delete') deleteMutation.mutate();
          else if (kind === 'cancel') cancelMutation.mutate();
          else if (kind === 'receipt') confirmMutation.mutate();
        }}
      />
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
  });

  const canCreate =
    hasPermission(me?.role, Permissions.AFTER_SALE_CREATE) &&
    (!me?.scopeUnitId || me.scopeUnitId === order.buyerUnitId) &&
    (order.status === 'SENT' ||
      order.status === 'PAYMENT_UPLOADED' ||
      order.status === 'CONFIRMED');

  const refresh = () => {
    void refreshAfterWrite(queryClient);
  };

  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title={t('sales.afterSale')} className="mb-0" />
      {isLoading ? (
        <Spinner size="sm" label={t('common.loading')} />
      ) : (returns?.items.length ?? 0) === 0 ? (
        <p className="text-xs text-ink-subtle">{t('sales.noAfterSale')}</p>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          {returns?.items.map((r) => (
            <Link
              key={r.id}
              to={`/returns/${r.id}`}
              className="flex flex-wrap items-center gap-2 text-brand-700 hover:underline"
            >
              <span>{r.returnNo}</span>
              <span className="text-ink-subtle">{t(`returns.statuses.${r.status}`)}</span>
              <span className="text-ink-subtle">{r.createdAt ? formatDateTime(r.createdAt, locale) : '—'}</span>
            </Link>
          ))}
        </div>
      )}
      {canCreate && <SalesReturnForm order={order} onCreated={refresh} />}
    </Card>
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
      setSaving(false);
      onCreated();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-muted p-3">
      <h3 className="text-sm font-semibold text-ink">{t('sales.startAfterSale')}</h3>
      <div className="flex flex-col gap-1">
        {order.items.map((line) => {
          const row = lines[line.id] ?? { qty: '', reason: '' };
          const lineName = line.itemName ?? line.itemId;
          return (
            <div key={line.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-40 truncate text-sm text-ink-soft">{lineName}</span>
              <Input
                type="number"
                min={0}
                className="w-28"
                value={row.qty}
                // 每行一对输入框：名称里带上物品，屏幕阅读器才能定位到具体哪一行。
                aria-label={`${t('sales.afterSaleQtyPlaceholder')} ${lineName}`}
                onChange={(e) =>
                  setLines((prev) => ({ ...prev, [line.id]: { ...row, qty: e.target.value } }))
                }
                placeholder={t('sales.afterSaleQtyPlaceholder')}
              />
              <Input
                className="w-60"
                value={row.reason}
                aria-label={`${t('sales.afterSaleLineReason')} ${lineName}`}
                onChange={(e) =>
                  setLines((prev) => ({ ...prev, [line.id]: { ...row, reason: e.target.value } }))
                }
                placeholder={t('sales.afterSaleLineReason')}
              />
            </div>
          );
        })}
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label={t('sales.afterSaleReason')}
        placeholder={t('sales.afterSaleReason')}
      />
      <ImageUpload value={photos} onChange={setPhotos} />
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      <div>
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('sales.startAfterSale')}
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<ExtractedSalesLineError[] | null>(null);

  const { data: batches, isLoading } = useQuery({
    queryKey: ['stock', 'batches', order.sellerUnitId],
    queryFn: () => listStockBatches({ unitId: order.sellerUnitId }),
    enabled: Boolean(order.sellerUnitId),
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
    setLineErrors(null);
    try {
      await sendSalesOrder(order.id, { allocations });
      await refreshAfterWrite(queryClient);
      onSent();
    } catch (cause) {
      const lines = extractSalesLineErrors(cause);
      if (lines) {
        setLineErrors(lines);
      } else {
        setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      }
      setSending(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title={t('sales.fefoPreview')} className="mb-0" />
      <p className="text-xs text-ink-subtle">{t('sales.fefoHint')}</p>
      {isLoading ? (
        <Spinner size="sm" label={t('common.loading')} />
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
            <div key={line.id} className="flex flex-col gap-1 rounded-lg border border-line p-2">
              <h3 className="text-sm font-semibold text-ink">
                {line.itemName ?? line.itemId} × {line.qty}
              </h3>
              {batchRows.length === 0 ? (
                <p className="text-xs font-medium text-warning-700">{t('sales.errors.noBatchStock')}</p>
              ) : (
                batchRows.map((row) => (
                  <div key={row.batchId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-40 truncate">{row.batchNo ?? row.batchId}</span>
                    <span className="text-ink-muted tabular-nums">
                      {row.expiryDate ?? '—'} · {t('inventory.qty')} {row.qty}
                    </span>
                    <span className="text-ink-subtle tabular-nums">
                      {t('sales.fefoSuggest')} {plan[row.batchId] ?? '0'}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      className="w-28"
                      value={manual[row.batchId] ?? ''}
                      // 每个批次一行：名称里带上批次号，避免整页都是同一个「手工数量」。
                      aria-label={`${t('sales.manualQty')} ${row.batchNo ?? row.batchId}`}
                      onChange={(e) => setManual((prev) => ({ ...prev, [row.batchId]: e.target.value }))}
                      placeholder={t('sales.manualQty')}
                    />
                  </div>
                ))
              )}
            </div>
          );
        })
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {lineErrors && lineErrors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-danger-600">
          {lineErrors.map((e, i) => (
            <p key={`${e.index}-${i}`}>{e.message}</p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={sending} onClick={() => void send()}>
          {t('sales.send')}
        </Button>
        <Button variant="secondary" disabled={sending} onClick={() => setManual({})}>
          {t('sales.fefoAuto')}
        </Button>
        <p className="text-xs text-warning-700">{t('sales.sendConfirm')}</p>
      </div>
    </Card>
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
  const [justUploaded, setJustUploaded] = useState(false);
  const justUploadedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (justUploadedTimer.current) clearTimeout(justUploadedTimer.current);
    };
  }, []);

  const upload = async () => {
    setSaving(true);
    setError(null);
    try {
      await uploadSalePayment(order.id, {
        amount,
        methodNote: methodNote.trim() || null,
        proofFileId: proofs[0]?.id ?? null,
      });
      setJustUploaded(true);
      if (justUploadedTimer.current) clearTimeout(justUploadedTimer.current);
      justUploadedTimer.current = setTimeout(() => setJustUploaded(false), 5000);
      onUploaded();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title={t('sales.uploadPayment')} className="mb-0" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('sales.paymentAmount')} required>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('sales.paymentMethod')}>
          <Input value={methodNote} onChange={(e) => setMethodNote(e.target.value)} />
        </Field>
        <Field label={t('sales.paymentProof')} className="sm:col-span-2" unlabeled>
          <ImageUpload value={proofs} onChange={setProofs} />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {justUploaded && (
        <p role="status" className="text-sm text-success-600">
          {t('sales.paymentUploadedHint')}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button variant="primary" loading={saving} onClick={() => void upload()}>
          {t('sales.uploadPayment')}
        </Button>
      </div>
    </Card>
  );
}
