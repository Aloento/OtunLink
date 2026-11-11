import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { CURRENCIES, type ItemDto, type MinSaleUnit } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { listItems } from '../../api/items';
import { refreshAfterWrite } from '../../api/queryClient';
import { createShipment, getShipment, updateShipment, type ShipmentCreateInput } from '../../api/shipments';
import { listUnits, type UnitDto } from '../../api/units';
import { useSession } from '../../auth/SessionProvider';
import { FIELD_OVERFLOW_GUARD, LINE_GRID_CLASS } from '../../components/lineGrid';
import { RefreshButton } from '../../components/RefreshButton';
import { specUnitOf, unitLabel } from '../../i18n/units';
import { Button } from '../../ui/button';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Textarea } from '../../ui/textarea';

interface TrackingLine {
  key: string;
  carrier: string;
  trackingNo: string;
  note: string;
}

interface ItemLine {
  key: string;
  itemId: string;
  name: string;
  spec: string | null;
  minSaleUnit: MinSaleUnit | null;
  isPerishable: boolean;
  expectedQty: string;
  unitPrice: string;
  productionDate: string;
  expiryDate: string;
  lineNote: string;
}

interface FormState {
  shipperUnitId: string;
  receiverUnitId: string;
  boxesCount: string;
  currency: string;
  expectedArrivalDate: string;
  remark: string;
}

let nextKey = 1;
function genKey(prefix: string): string {
  nextKey += 1;
  return `${prefix}-${nextKey}`;
}

function emptyTracking(): TrackingLine {
  return { key: genKey('t'), carrier: '', trackingNo: '', note: '' };
}

function sanitizeIntegerInput(value: string): string {
  return value.replace(/\D/g, '');
}

function sanitizeDecimalInput(value: string): string {
  const sanitized = value.replace(/[^\d.]/g, '');
  const [head, ...rest] = sanitized.split('.');
  if (!head && sanitized.startsWith('.')) return `0.${rest.join('')}`;
  return rest.length ? `${head}.${rest.join('').replace(/\./g, '')}` : head ?? '';
}

// 最小销售单位：INNER 取内装单位，否则取规格单位（键值；文案分组按 minSaleUnit）。
function emptyItem(item?: ItemDto): ItemLine {
  return {
    key: genKey('i'),
    itemId: item?.id ?? '',
    name: item?.name ?? '',
    spec: specUnitOf(item),
    minSaleUnit: item?.minSaleUnit ?? null,
    isPerishable: item?.isPerishable ?? false,
    expectedQty: '',
    unitPrice: '',
    productionDate: '',
    expiryDate: '',
    lineNote: '',
  };
}

// 发货单新建/编辑：多物流单号、箱数、清单复用（搜索物品 + 效期上报）。
export function ShipmentFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const isEdit = Boolean(params.id);

  const [form, setForm] = useState<FormState>({
    shipperUnitId: '',
    receiverUnitId: '',
    boxesCount: '0',
    currency: 'CNY',
    expectedArrivalDate: '',
    remark: '',
  });
  const [trackings, setTrackings] = useState<TrackingLine[]>([emptyTracking()]);
  const [lines, setLines] = useState<ItemLine[]>([emptyItem()]);
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => listUnits(),
  });

  const { data: itemPage } = useQuery({
    queryKey: ['items', 'picker', itemSearch],
    queryFn: () => listItems({ q: itemSearch || undefined, size: 50 }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['shipments', params.id],
    queryFn: () => getShipment(params.id!),
    enabled: isEdit,
  });

  const shipperUnits = useMemo(
    () => (units ?? []).filter((u) => u.type === 'COLLECTOR' && u.isActive),
    [units],
  );
  const receiverUnits = useMemo(
    () => (units ?? []).filter((u) => u.type === 'WAREHOUSE' && u.isActive),
    [units],
  );

  // 数据范围：scope 非空时发货方锁定为本单元。
  useEffect(() => {
    if (form.shipperUnitId) return;
    if (me?.scopeUnitId) {
      setForm((prev) => ({ ...prev, shipperUnitId: me.scopeUnitId! }));
      return;
    }
    if (shipperUnits.length === 1) {
      setForm((prev) => ({ ...prev, shipperUnitId: shipperUnits[0].id }));
    }
  }, [form.shipperUnitId, me?.scopeUnitId, shipperUnits]);

  // 编辑：回填详情。
  useEffect(() => {
    if (!detail) return;
    setForm({
      shipperUnitId: detail.shipperUnitId,
      receiverUnitId: detail.receiverUnitId,
      boxesCount: String(detail.boxesCount),
      currency: detail.currency,
      expectedArrivalDate: detail.expectedArrivalDate ?? '',
      remark: detail.remark ?? '',
    });
    setTrackings(
      detail.trackings.map((tr) => ({
        key: genKey('t'),
        carrier: tr.carrier,
        trackingNo: tr.trackingNo,
        note: tr.note ?? '',
      })),
    );
    setLines(
      detail.items.map((item) => ({
        key: genKey('i'),
        itemId: item.itemId ?? '',
        name: item.name,
        spec: item.spec,
        minSaleUnit: item.minSaleUnit,
        isPerishable: item.productionDate !== null || item.expiryDate !== null,
        expectedQty: item.expectedQty,
        unitPrice: item.unitPrice ?? '',
        productionDate: item.productionDate ?? '',
        expiryDate: item.expiryDate ?? '',
        lineNote: item.lineNote ?? '',
      })),
    );
  }, [detail]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setTracking = (key: string, field: keyof TrackingLine, value: string) =>
    setTrackings((prev) => prev.map((t) => (t.key === key ? { ...t, [field]: value } : t)));

  const setLine = (key: string, field: keyof ItemLine, value: string | boolean) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const pickItem = (key: string, itemId: string) => {
    const item = (itemPage?.items ?? []).find((i) => i.id === itemId);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
            ...l,
            itemId,
            name: item?.name ?? l.name,
            spec: specUnitOf(item) ?? l.spec,
            minSaleUnit: item?.minSaleUnit ?? l.minSaleUnit,
            isPerishable: item?.isPerishable ?? l.isPerishable,
          }
          : l,
      ),
    );
  };

  // 「应收数量」后缀单位随物品的「最小销售单位」变化（与销售清单一致）。
  const quantityUnitSuffix = (line: ItemLine): string => {
    const item = (itemPage?.items ?? []).find((candidate) => candidate.id === line.itemId);
    // 物品不在当前候选项（编辑回显的非本页物品）时退回详情带回的规格与 minSaleUnit。
    const unit = item ? specUnitOf(item) : line.spec;
    const minSaleUnit = item?.minSaleUnit ?? line.minSaleUnit;
    return unit ? ` (${unitLabel(t, unit, minSaleUnit)})` : '';
  };

  const buildPayload = (): ShipmentCreateInput | null => {
    const boxesCount = Number(form.boxesCount);
    if (!form.shipperUnitId || !form.receiverUnitId) {
      setError(t('shipments.errors.unitRequired'));
      return null;
    }
    if (!Number.isInteger(boxesCount) || boxesCount < 1) {
      setError(t('shipments.errors.boxesAtLeastOne'));
      return null;
    }
    if (trackings.some((tr) => !tr.carrier.trim() || !tr.trackingNo.trim())) {
      setError(t('shipments.errors.trackingRequired'));
      return null;
    }
    const invalidItemLine = lines.findIndex((l) => !l.itemId || !l.expectedQty.trim());
    if (invalidItemLine >= 0) {
      const field = lines[invalidItemLine].itemId ? t('shipments.expectedQty') : t('shipments.itemName');
      setError(t('shipments.errors.fieldRequired', { field }));
      return null;
    }
    const invalidPriceLine = lines.findIndex((l) => l.unitPrice.trim() && Number.isNaN(Number(l.unitPrice.trim())));
    if (invalidPriceLine >= 0) {
      setError(t('shipments.errors.invalidField', { field: t('shipments.unitPrice') }));
      return null;
    }
    if (lines.some((l) => l.isPerishable && (!l.productionDate || !l.expiryDate))) {
      setError(t('shipments.errors.expiryRequired'));
      return null;
    }
    return {
      shipperUnitId: form.shipperUnitId,
      receiverUnitId: form.receiverUnitId,
      boxesCount,
      currency: form.currency.trim() || 'CNY',
      expectedArrivalDate: form.expectedArrivalDate || null,
      remark: form.remark.trim() || null,
      trackings: trackings.map((tr) => ({
        carrier: tr.carrier.trim(),
        trackingNo: tr.trackingNo.trim(),
        note: tr.note.trim() || null,
      })),
      items: lines.map((l) => ({
        itemId: l.itemId,
        expectedQty: l.expectedQty.trim(),
        unitPrice: l.unitPrice.trim() || null,
        productionDate: l.productionDate || null,
        expiryDate: l.expiryDate || null,
        lineNote: l.lineNote.trim() || null,
      })),
    };
  };

  const submit = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        const id = params.id!;
        await updateShipment(id, payload);
        void refreshAfterWrite(queryClient);
        navigate(`/shipments/${id}`);
      } else {
        const created = await createShipment(payload);
        void refreshAfterWrite(queryClient);
        navigate(`/shipments/${created.id}`);
      }
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  if (unitsLoading || (isEdit && detailLoading)) {
    return <Spinner label={t('common.loading')} />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={isEdit ? t('shipments.editTitle') : t('shipments.createTitle')} />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      <div className={`grid grid-cols-1 items-start gap-4 sm:grid-cols-2 ${FIELD_OVERFLOW_GUARD}`}>
        <Field label={t('shipments.shipper')} required>
          <Select
            value={form.shipperUnitId}
            onValueChange={(value) => set('shipperUnitId', value)}
            disabled={Boolean(me?.scopeUnitId)}
          >
            <option value="">—</option>
            {shipperUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('shipments.receiver')} required>
          <Select value={form.receiverUnitId} onValueChange={(value) => set('receiverUnitId', value)}>
            <option value="">—</option>
            {receiverUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('shipments.boxes')} required>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={form.boxesCount}
            onChange={(e) => set('boxesCount', sanitizeIntegerInput(e.target.value))}
          />
        </Field>
        <Field label={t('shipments.currency')}>
          <Select value={form.currency} onValueChange={(value) => set('currency', value)}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('shipments.expectedArrivalDate')}>
          <Input
            type="date"
            value={form.expectedArrivalDate}
            onChange={(e) => set('expectedArrivalDate', e.target.value)}
          />
        </Field>
        <Field label={t('shipments.remark')} className="sm:col-span-2">
          <Textarea value={form.remark} onChange={(e) => set('remark', e.target.value)} rows={2} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">{t('shipments.trackings')}</h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setTrackings((prev) => [...prev, emptyTracking()])}
          >
            {t('shipments.addTracking')}
          </Button>
        </div>
        {trackings.map((tr, index) => (
          <div
            key={tr.key}
            className={`${LINE_GRID_CLASS} rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_1fr_auto]`}
          >
            <Field label={t('shipments.carrier')} required>
              <Input
                aria-label={`${t('shipments.carrier')} ${index + 1}`}
                value={tr.carrier}
                onChange={(e) => setTracking(tr.key, 'carrier', e.target.value)}
              />
            </Field>
            <Field label={t('shipments.trackingNo')} required>
              <Input
                aria-label={`${t('shipments.trackingNo')} ${index + 1}`}
                value={tr.trackingNo}
                onChange={(e) => setTracking(tr.key, 'trackingNo', e.target.value)}
              />
            </Field>
            <Field label={t('shipments.trackingNote')}>
              <Input
                aria-label={`${t('shipments.trackingNote')} ${index + 1}`}
                value={tr.note}
                onChange={(e) => setTracking(tr.key, 'note', e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button
                size="sm"
                variant="subtle"
                disabled={trackings.length <= 1}
                aria-label={`${t('shipments.remove')} ${tr.trackingNo.trim() || index + 1}`}
                onClick={() => setTrackings((prev) => prev.filter((x) => x.key !== tr.key))}
              >
                {t('shipments.remove')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">{t('shipments.items')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton queryKey={['items', 'picker']} additionalKeys={[['units', 'list']]} />
            <Input
              value={itemSearch}
              placeholder={t('shipments.itemSearchPlaceholder')}
              aria-label={t('shipments.itemSearchPlaceholder')}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <Button asChild size="sm" variant="secondary">
              <Link to="/items/new" target="_blank" rel="noopener noreferrer">
                {t('shipments.newItem')}
              </Link>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setLines((prev) => [...prev, emptyItem()])}
            >
              {t('shipments.addItem')}
            </Button>
          </div>
        </div>
        {lines.map((line, index) => (
          <div key={line.key} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className={`${LINE_GRID_CLASS} sm:grid-cols-3`}>
              <Field label={t('shipments.itemName')} required className="sm:col-span-1">
                <Select value={line.itemId} onValueChange={(value) => pickItem(line.key, value)}>
                  <option value="">{t('shipments.selectItem')}</option>
                  {(itemPage?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sku ? ` · ${item.sku}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${t('shipments.expectedQty')}${quantityUnitSuffix(line)}`} required>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={line.expectedQty}
                  onChange={(e) => setLine(line.key, 'expectedQty', sanitizeIntegerInput(e.target.value))}
                />
              </Field>
              <Field label={t('shipments.unitPrice')}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(e) => setLine(line.key, 'unitPrice', sanitizeDecimalInput(e.target.value))}
                />
              </Field>
            </div>
            {line.isPerishable && (
              <div className={`${LINE_GRID_CLASS} sm:grid-cols-2`}>
                <Field label={t('shipments.productionDate')} required>
                  <Input
                    type="date"
                    value={line.productionDate}
                    onChange={(e) => setLine(line.key, 'productionDate', e.target.value)}
                  />
                </Field>
                <Field label={t('shipments.expiryDate')} required>
                  <Input
                    type="date"
                    value={line.expiryDate}
                    onChange={(e) => setLine(line.key, 'expiryDate', e.target.value)}
                  />
                </Field>
              </div>
            )}
            <div className={`${LINE_GRID_CLASS} sm:grid-cols-[1fr_auto]`}>
              <Field label={t('shipments.lineNote')}>
                <Input
                  value={line.lineNote}
                  onChange={(e) => setLine(line.key, 'lineNote', e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={lines.length <= 1}
                  aria-label={`${t('shipments.remove')} ${line.name.trim() || index + 1}`}
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== line.key))}
                >
                  {t('shipments.remove')}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={saving || !form.shipperUnitId || !form.receiverUnitId}
          onClick={() => void submit()}
        >
          {t('shipments.save')}
        </Button>
        <Button
          asChild
          variant="secondary"
          aria-disabled={saving || undefined}
          className={saving ? 'pointer-events-none opacity-50' : undefined}
        >
          <Link to={isEdit ? `/shipments/${params.id}` : '/shipments'}>{t('shipments.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
