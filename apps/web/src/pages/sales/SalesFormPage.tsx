import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  CURRENCIES,
  DELIVERY_METHODS,
  SALES_SOURCES,
  type Currency,
  type DeliveryMethod,
  type RetailPriceDto,
  type SalesOrderCreateInput,
  type SalesOrderPatchInput,
  type SalesSource,
} from '@otunlink/shared';

import { errorI18nKey, extractSalesLineErrors, isApiError, type ExtractedSalesLineError } from '../../api/http';
import { listItems } from '../../api/items';
import { listPartnerships } from '../../api/partnerships';
import { listRetailPrices } from '../../api/retail-prices';
import { createSalesOrder, getSalesOrder, updateSalesOrder } from '../../api/sales';
import { listStockBatches } from '../../api/stock';
import { listUnits, type UnitDto } from '../../api/units';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { specUnitOf, unitLabel } from '../../i18n/units';
import { RefreshButton } from '../../components/RefreshButton';
import { FIELD_OVERFLOW_GUARD, LINE_GRID_CLASS } from '../../components/lineGrid';
import { Button } from '../../ui/button';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Textarea } from '../../ui/textarea';

interface LineState {
  key: string;
  itemId: string;
  qty: string;
  unitPriceOverride: string;
}

let nextKey = 1;
function genKey(): string {
  nextKey += 1;
  return `sl-${nextKey}`;
}

function emptyLine(): LineState {
  return { key: genKey(), itemId: '', qty: '', unitPriceOverride: '' };
}

// 销售单新建/编辑：选仓库/门店/物品/数量（行改价可选）/折扣/本单货币/送货方式。
// 金额由服务端按零售价快照计算（不做货币换算），前端仅展示提示。
export function SalesFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { me } = useSession();

  const [sellerUnitId, setSellerUnitId] = useState('');
  const [buyerUnitId, setBuyerUnitId] = useState('');
  const [source, setSource] = useState<SalesSource>(
    me?.role === 'RETAILER' ? 'RETAILER_REQUEST' : 'WAREHOUSE_INITIATED',
  );
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [freight, setFreight] = useState('0');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [currency, setCurrency] = useState<Currency>('CNY');
  // 用户手动改过货币后，不再自动跟随明细的默认零售价货币。
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [remark, setRemark] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<ExtractedSalesLineError[] | null>(null);

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => listUnits(),
  });
  const partnershipsQuery = useQuery({
    queryKey: ['partnerships', 'list'],
    queryFn: () => listPartnerships(),
  });

  const { data: itemPage } = useQuery({
    queryKey: ['items', 'picker', itemSearch],
    queryFn: () => listItems({ q: itemSearch || undefined, size: 50 }),
  });

  const { data: stockBatches } = useQuery({
    queryKey: ['stock', 'batches', sellerUnitId],
    queryFn: () => listStockBatches({ unitId: sellerUnitId }),
    enabled: Boolean(sellerUnitId),
  });

  // 每个 itemId 在该仓库的可用库存合计（所有批次 qty 之和）。
  const itemStock = useMemo(() => {
    const map = new Map<string, number>();
    for (const batch of stockBatches?.items ?? []) {
      map.set(batch.itemId, (map.get(batch.itemId) ?? 0) + Number(batch.qty));
    }
    return map;
  }, [stockBatches]);

  // 卖方仓库的默认零售价：仅用于展示货币与提示行级改价，金额仍由服务端快照。
  const { data: retailPrices } = useQuery({
    queryKey: ['retail-prices', 'unit', sellerUnitId],
    queryFn: () => listRetailPrices({ unitId: sellerUnitId }),
    enabled: Boolean(sellerUnitId),
  });

  const retailPriceByItem = useMemo(() => {
    const map = new Map<string, RetailPriceDto>();
    for (const rp of retailPrices?.items ?? []) map.set(rp.itemId, rp);
    return map;
  }, [retailPrices]);

  const retailCurrencyOf = (itemId: string): string | undefined =>
    retailPriceByItem.get(itemId)?.currency;

  const itemNameOf = (itemId: string): string =>
    (itemPage?.items ?? []).find((candidate) => candidate.id === itemId)?.name ?? '—';

  const detailQuery = useQuery({
    queryKey: ['sales-orders', id],
    queryFn: () => getSalesOrder(id!),
    enabled: isEdit,
  });

  const warehouses = useMemo(() => {
    if (me?.role === 'RETAILER') {
      return (partnershipsQuery.data?.items ?? []).map((p) => ({
        id: p.warehouseUnitId,
        name: p.warehouseUnitName ?? p.warehouseUnitId,
      }));
    }
    return (units ?? []).filter((u) => u.type === 'WAREHOUSE' && u.isActive);
  }, [me, partnershipsQuery.data, units]);
  const retailers = useMemo(() => {
    if (me?.role === 'WAREHOUSE') {
      return (partnershipsQuery.data?.items ?? []).map((p) => ({
        id: p.retailerUnitId,
        name: p.retailerUnitName ?? p.retailerUnitId,
      }));
    }
    return (units ?? []).filter((u) => u.type === 'RETAILER' && u.isActive);
  }, [me, partnershipsQuery.data, units]);

  useEffect(() => {
    if (detailQuery.data) {
      const order = detailQuery.data;
      setSellerUnitId(order.sellerUnitId);
      setBuyerUnitId(order.buyerUnitId);
      setSource(order.source);
      setDeliveryMethod(order.deliveryMethod);
      setDeliveryAddress(order.deliveryAddress ?? '');
      setFreight(order.freight ?? '0');
      setDiscountPercent(order.discountPercent);
      setCurrency(order.currency as Currency);
      setCurrencyTouched(true);
      setRemark(order.remark ?? '');
      setCarrier(order.carrier ?? '');
      setTrackingNo(order.trackingNo ?? '');
      setLines(
        order.items.length > 0
          ? order.items.map((line) => ({
            key: genKey(),
            itemId: line.itemId,
            qty: line.qty,
            unitPriceOverride: line.priceOverridden ? line.price ?? '' : '',
          }))
          : [emptyLine()],
      );
    }
  }, [detailQuery.data]);

  // 默认选择：仓库/零售有 scope 直接锁定自己；否则唯一时自动选中。
  useEffect(() => {
    if (isEdit) return;
    if (!sellerUnitId) {
      if (me?.role === 'WAREHOUSE' && me.scopeUnitId) setSellerUnitId(me.scopeUnitId);
      else if (warehouses.length === 1) setSellerUnitId(warehouses[0].id);
    }
    if (!buyerUnitId) {
      if (me?.role === 'RETAILER' && me.scopeUnitId) setBuyerUnitId(me.scopeUnitId);
      else if (retailers.length === 1) setBuyerUnitId(retailers[0].id);
    }
  }, [isEdit, sellerUnitId, buyerUnitId, me, warehouses, retailers]);

  // 新建时本单货币默认跟随第一条明细的默认零售价货币（未手动改过时）。
  useEffect(() => {
    if (isEdit || currencyTouched) return;
    const first = lines.find((l) => l.itemId && retailPriceByItem.get(l.itemId)?.currency);
    if (!first) return;
    const next = retailPriceByItem.get(first.itemId)!.currency as Currency;
    setCurrency((prev) => (prev === next ? prev : next));
  }, [isEdit, currencyTouched, lines, retailPriceByItem]);

  const setLine = (key: string, field: keyof LineState, value: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  // 移除明细行：单据至少保留一行（服务端 lines.min(1) 约束）。行号会整体前移，同时清掉按行号返回的服务端错误。
  const removeLine = (key: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
    setLineErrors(null);
  };

  const validate = (): string | null => {
    if (!sellerUnitId) return t('sales.errors.sellerRequired');
    if (!buyerUnitId) return t('sales.errors.buyerRequired');
    if (lines.some((l) => !l.itemId || !l.qty.trim())) return t('sales.errors.itemRequired');
    const mismatch = lines.findIndex(
      (l) =>
        l.itemId &&
        !l.unitPriceOverride.trim() &&
        retailCurrencyOf(l.itemId) !== undefined &&
        retailCurrencyOf(l.itemId) !== currency,
    );
    if (mismatch >= 0) {
      const line = lines[mismatch];
      return t('sales.errors.currencyMismatch', {
        index: mismatch + 1,
        itemName: itemNameOf(line.itemId),
        listCurrency: retailCurrencyOf(line.itemId),
        currency,
      });
    }
    return null;
  };

  const submit = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    const linePayload = lines.map((l) => ({
      itemId: l.itemId,
      qty: l.qty.trim(),
      unitPriceOverride: l.unitPriceOverride.trim() || null,
    }));
    setSaving(true);
    setError(null);
    setLineErrors(null);
    try {
      if (isEdit) {
        const payload: SalesOrderPatchInput = {
          source,
          deliveryMethod,
          deliveryAddress: deliveryAddress.trim() || null,
          freight,
          discountPercent,
          currency,
          remark: remark.trim() || null,
          carrier: carrier.trim() || null,
          trackingNo: trackingNo.trim() || null,
          lines: linePayload,
        };
        await updateSalesOrder(id!, payload);
      } else {
        const payload: SalesOrderCreateInput = {
          sellerUnitId,
          buyerUnitId,
          source,
          deliveryMethod,
          deliveryAddress: deliveryAddress.trim() || null,
          freight,
          discountPercent,
          currency,
          remark: remark.trim() || null,
          carrier: carrier.trim() || null,
          trackingNo: trackingNo.trim() || null,
          lines: linePayload,
        };
        const created = await createSalesOrder(payload);
        void refreshAfterWrite(queryClient);
        navigate(`/sales/${created.id}`);
        return;
      }
      void refreshAfterWrite(queryClient);
      navigate(`/sales/${id}`);
    } catch (cause) {
      const lines = extractSalesLineErrors(cause);
      if (lines) {
        setLineErrors(lines);
      } else {
        setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      }
      setSaving(false);
    }
  };

  if (unitsLoading || (isEdit && detailQuery.isLoading)) {
    return <Spinner label={t('common.loading')} />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={isEdit ? t('sales.editTitle') : t('sales.createTitle')} />

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

      {/* items-start：字段行被同排带 hint 的字段撑高时不拉伸其他字段；min-w-0 让原生 select 不按最长选项撑列 */}
      <div className={`grid grid-cols-1 items-start gap-4 sm:grid-cols-2 ${FIELD_OVERFLOW_GUARD}`}>
        <Field label={t('sales.seller')} required>
          <Select
            value={sellerUnitId}
            onValueChange={setSellerUnitId}
            disabled={isEdit || me?.role === 'WAREHOUSE'}
          >
            <option value="">—</option>
            {warehouses.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('sales.buyer')} required>
          <Select
            value={buyerUnitId}
            onValueChange={setBuyerUnitId}
            disabled={isEdit || me?.role === 'RETAILER'}
          >
            <option value="">—</option>
            {retailers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('sales.source')} hint={t('sales.sourceHint')}>
          <Select value={source} onValueChange={(next) => setSource(next as SalesSource)}>
            {SALES_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`sales.sources.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('sales.deliveryMethod')} hint={t(`sales.deliveryMethodHints.${deliveryMethod}`)}>
          <Select
            value={deliveryMethod}
            onValueChange={(next) => setDeliveryMethod(next as DeliveryMethod)}
          >
            {DELIVERY_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`sales.deliveryMethods.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
        {deliveryMethod !== 'PICKUP' && (
          <Field label={t('sales.deliveryAddress')} className="sm:col-span-2">
            <Input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder={t('sales.deliveryAddress')}
            />
          </Field>
        )}
        {deliveryMethod !== 'PICKUP' && (
          <Field label={t('sales.carrier')}>
            <Input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder={t('sales.carrierPlaceholder')}
            />
          </Field>
        )}
        {deliveryMethod !== 'PICKUP' && (
          <Field label={t('sales.trackingNo')}>
            <Input
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              placeholder={t('sales.trackingNoPlaceholder')}
            />
          </Field>
        )}
        <Field label={t('sales.freight')}>
          <Input type="number" min={0} value={freight} onChange={(e) => setFreight(e.target.value)} />
        </Field>
        <Field label={t('sales.discountPercent')}>
          <Input
            type="number"
            min={0}
            max={100}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
          />
        </Field>
        <Field label={t('sales.currency')} hint={t('sales.currencyHint')}>
          <Select
            value={currency}
            onValueChange={(next) => {
              setCurrencyTouched(true);
              setCurrency(next as Currency);
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('sales.remark')} className="sm:col-span-2">
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">{t('sales.items')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton
              queryKey={['items', 'picker']}
              additionalKeys={[['stock', 'batches'], ['units', 'list'], ['partnerships', 'list']]}
            />
            <Input
              value={itemSearch}
              placeholder={t('items.itemSearchPlaceholder')}
              // 占位符不能当名字：输入框自己要有可访问名称。
              aria-label={t('items.itemSearchPlaceholder')}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-40 sm:w-44"
            />
            <Button size="sm" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              {t('sales.addLine')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-ink-subtle">{t('sales.unitPriceOverrideHint')}</p>
        {lines.map((line, index) => (
          <div key={line.key} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
            <div className={`${LINE_GRID_CLASS} sm:grid-cols-[1fr_1fr_1fr_auto]`}>
              <Field className="min-w-0" label={t('sales.itemName')} required>
                <Select
                  className="w-full"
                  value={line.itemId}
                  onValueChange={(next) => setLine(line.key, 'itemId', next)}
                >
                  <option value="">—</option>
                  {(itemPage?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sku ? ` · ${item.sku}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                className="min-w-0"
                label={`${t('sales.qty')}${(() => {
                  const item = (itemPage?.items ?? []).find((candidate) => candidate.id === line.itemId);
                  const unit = specUnitOf(item);
                  return unit ? ` (${unitLabel(t, unit, item?.minSaleUnit)})` : '';
                })()}`}
                required
              >
                <Input
                  className="w-full"
                  type="number"
                  min={0}
                  value={line.qty}
                  onChange={(e) => setLine(line.key, 'qty', e.target.value)}
                />
              </Field>
              <Field className="min-w-0" label={`${t('sales.unitPriceOverride')} (${currency})`}>
                <Input
                  className="w-full"
                  type="number"
                  min={0}
                  value={line.unitPriceOverride}
                  onChange={(e) => setLine(line.key, 'unitPriceOverride', e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="subtle"
                  // 每行一个「移除行」：可访问名称带上物品名（未选物品时退行号）。
                  aria-label={`${t('sales.removeLine')} ${line.itemId ? itemNameOf(line.itemId) : index + 1}`}
                  disabled={lines.length <= 1}
                  onClick={() => removeLine(line.key)}
                >
                  {t('sales.removeLine')}
                </Button>
              </div>
            </div>
            {line.itemId && (
              <p className="text-xs text-ink-subtle">
                {t('sales.availableStock')}: {itemStock.get(line.itemId) ?? '—'}
                {retailPriceByItem.get(line.itemId)
                  ? ` · ${t('sales.listPrice')}: ${retailPriceByItem.get(line.itemId)!.price} ${retailPriceByItem.get(line.itemId)!.currency}`
                  : ''}
              </p>
            )}
            {line.itemId &&
              !line.unitPriceOverride.trim() &&
              retailCurrencyOf(line.itemId) !== undefined &&
              retailCurrencyOf(line.itemId) !== currency && (
                <p role="alert" className="text-xs font-medium text-danger-600">
                  {t('sales.lineCurrencyMismatch', {
                    listCurrency: retailCurrencyOf(line.itemId),
                    currency,
                  })}
                </p>
              )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {isEdit ? t('sales.create') : t('sales.saveDraft')}
          </Button>
          <Button asChild variant="secondary">
            <Link
              to={isEdit ? `/sales/${id}` : '/sales'}
              aria-disabled={saving || undefined}
              tabIndex={saving ? -1 : undefined}
              className={saving ? 'pointer-events-none opacity-50' : undefined}
            >
              {t('sales.cancel')}
            </Link>
          </Button>
        </div>
        {!isEdit && <p className="text-xs text-ink-subtle">{t('sales.saveDraftHint')}</p>}
      </div>
    </div>
  );
}
