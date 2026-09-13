import {
  Button,
  Field,
  Input,
  Select,
  Spinner,
  Text,
  Textarea,
  Title1,
} from '@fluentui/react-components';
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
      <Title1 as="h1">{isEdit ? t('sales.editTitle') : t('sales.createTitle')}</Title1>

      {error && <Text className="text-red-600">{error}</Text>}
      {lineErrors && lineErrors.length > 0 && (
        <div className="flex flex-col gap-1">
          {lineErrors.map((e, i) => (
            <div key={`${e.index}-${i}`} className="text-red-600">
              {e.message}
            </div>
          ))}
        </div>
      )}

      {/* items-start：Field 根节点是 display:grid，被同行带 hint 的字段撑高时会拉伸行高把控件挤下去 */}
      <div className={`grid grid-cols-1 items-start gap-4 sm:grid-cols-2 ${FIELD_OVERFLOW_GUARD}`}>
        <Field label={t('sales.seller')} required>
          <Select
            value={sellerUnitId}
            onChange={(_, d) => setSellerUnitId(d.value)}
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
            onChange={(_, d) => setBuyerUnitId(d.value)}
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
        {!isEdit && (
          <Field label={t('sales.source')} hint={t('sales.sourceHint')}>
            <Select value={source} onChange={(_, d) => setSource(d.value as SalesSource)}>
              {SALES_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`sales.sources.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('sales.deliveryMethod')} hint={t(`sales.deliveryMethodHints.${deliveryMethod}`)}>
          <Select
            value={deliveryMethod}
            onChange={(_, d) => setDeliveryMethod(d.value as DeliveryMethod)}
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
              onChange={(_, d) => setDeliveryAddress(d.value)}
              placeholder={t('sales.deliveryAddress')}
            />
          </Field>
        )}
        {deliveryMethod !== 'PICKUP' && (
          <Field label={t('sales.carrier')}>
            <Input
              value={carrier}
              onChange={(_, d) => setCarrier(d.value)}
              placeholder={t('sales.carrierPlaceholder')}
            />
          </Field>
        )}
        {deliveryMethod !== 'PICKUP' && (
          <Field label={t('sales.trackingNo')}>
            <Input
              value={trackingNo}
              onChange={(_, d) => setTrackingNo(d.value)}
              placeholder={t('sales.trackingNoPlaceholder')}
            />
          </Field>
        )}
        <Field label={t('sales.freight')}>
          <Input type="number" min={0} value={freight} onChange={(_, d) => setFreight(d.value)} />
        </Field>
        <Field label={t('sales.discountPercent')}>
          <Input
            type="number"
            min={0}
            max={100}
            value={discountPercent}
            onChange={(_, d) => setDiscountPercent(d.value)}
          />
        </Field>
        <Field label={t('sales.currency')} hint={t('sales.currencyHint')}>
          <Select
            value={currency}
            onChange={(_, d) => {
              setCurrencyTouched(true);
              setCurrency(d.value as Currency);
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
          <Textarea value={remark} onChange={(_, d) => setRemark(d.value)} rows={2} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text as="h2" weight="semibold" size={400}>
            {t('sales.items')}
          </Text>
          <div className="flex items-center gap-2">
            <RefreshButton
              queryKey={['items', 'picker']}
              additionalKeys={[['stock', 'batches'], ['units', 'list'], ['partnerships', 'list']]}
            />
            <Input
              value={itemSearch}
              placeholder={t('items.itemSearchPlaceholder')}
              onChange={(_, d) => setItemSearch(d.value)}
              className="min-w-44"
            />
            <Button size="small" appearance="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              {t('sales.addLine')}
            </Button>
          </div>
        </div>
        <Text size={200} className="text-neutral-500">
          {t('sales.unitPriceOverrideHint')}
        </Text>
        {lines.map((line) => (
          <div key={line.key} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <div className={`${LINE_GRID_CLASS} [&_.fui-Select__select]:h-8 [&_.fui-Input__input]:h-8 sm:grid-cols-3`}>
              <Field className="min-w-0" label={t('sales.itemName')} required>
                <Select className="w-full" value={line.itemId} onChange={(_, d) => setLine(line.key, 'itemId', d.value)}>
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
                  })()
                  }`}
                required
              >
                <Input
                  className="w-full"
                  type="number"
                  min={0}
                  value={line.qty}
                  onChange={(_, d) => setLine(line.key, 'qty', d.value)}
                />
              </Field>
              <Field className="min-w-0" label={`${t('sales.unitPriceOverride')} (${currency})`}>
                <Input
                  className="w-full"
                  type="number"
                  min={0}
                  value={line.unitPriceOverride}
                  onChange={(_, d) => setLine(line.key, 'unitPriceOverride', d.value)}
                />
              </Field>
            </div>
            {line.itemId && (
              <Text size={200} className="text-neutral-500">
                {t('sales.availableStock')}: {itemStock.get(line.itemId) ?? '—'}
                {retailPriceByItem.get(line.itemId)
                  ? ` · ${t('sales.listPrice')}: ${retailPriceByItem.get(line.itemId)!.price} ${retailPriceByItem.get(line.itemId)!.currency}`
                  : ''}
              </Text>
            )}
            {line.itemId &&
              !line.unitPriceOverride.trim() &&
              retailCurrencyOf(line.itemId) !== undefined &&
              retailCurrencyOf(line.itemId) !== currency && (
                <Text size={200} className="text-red-600">
                  {t('sales.lineCurrencyMismatch', {
                    listCurrency: retailCurrencyOf(line.itemId),
                    currency,
                  })}
                </Text>
              )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button appearance="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? <Spinner size="tiny" /> : isEdit ? t('sales.create') : t('sales.saveDraft')}
          </Button>
          <Link to={isEdit ? `/sales/${id}` : '/sales'}>
            <Button appearance="secondary" disabled={saving}>
              {t('sales.cancel')}
            </Button>
          </Link>
        </div>
        {!isEdit && (
          <Text size={200} className="text-neutral-500">
            {t('sales.saveDraftHint')}
          </Text>
        )}
      </div>
    </div>
  );
}
