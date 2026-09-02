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

import { CURRENCIES, type ItemDto } from '@otunlink/shared';

import { useSession } from '../../auth/SessionProvider';
import { RefreshButton } from '../../components/RefreshButton';
import { errorI18nKey, isApiError } from '../../api/http';
import { listItems } from '../../api/items';
import { createShipment, getShipment, updateShipment, type ShipmentCreateInput } from '../../api/shipments';
import { listUnits, type UnitDto } from '../../api/units';

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

function emptyItem(item?: ItemDto): ItemLine {
  return {
    key: genKey('i'),
    itemId: item?.id ?? '',
    name: item?.name ?? '',
    spec: item?.specUnit ?? null,
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
    staleTime: 60_000,
  });

  const { data: itemPage } = useQuery({
    queryKey: ['items', 'picker', itemSearch],
    queryFn: () => listItems({ q: itemSearch || undefined, size: 50 }),
    staleTime: 30_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['shipments', params.id],
    queryFn: () => getShipment(params.id!),
    enabled: isEdit,
    staleTime: 15_000,
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
              spec: item?.specUnit ?? l.spec,
              isPerishable: item?.isPerishable ?? l.isPerishable,
            }
          : l,
      ),
    );
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
        void queryClient.invalidateQueries({ queryKey: ['shipments'] });
        navigate(`/shipments/${id}`);
      } else {
        const created = await createShipment(payload);
        void queryClient.invalidateQueries({ queryKey: ['shipments'] });
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
      <Title1 as="h1">{isEdit ? t('shipments.editTitle') : t('shipments.createTitle')}</Title1>

      {error && <Text className="text-red-600">{error}</Text>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('shipments.shipper')} required>
          <Select
            value={form.shipperUnitId}
            onChange={(_, d) => set('shipperUnitId', d.value)}
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
          <Select value={form.receiverUnitId} onChange={(_, d) => set('receiverUnitId', d.value)}>
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
            onChange={(_, d) => set('boxesCount', sanitizeIntegerInput(d.value))}
          />
        </Field>
        <Field label={t('shipments.currency')}>
          <Select value={form.currency} onChange={(_, d) => set('currency', d.value)}>
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
            onChange={(_, d) => set('expectedArrivalDate', d.value)}
          />
        </Field>
        <Field label={t('shipments.remark')} className="sm:col-span-2">
          <Textarea value={form.remark} onChange={(_, d) => set('remark', d.value)} rows={2} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Text as="h2" weight="semibold" size={400}>
            {t('shipments.trackings')}
          </Text>
          <Button
            size="small"
            appearance="secondary"
            onClick={() => setTrackings((prev) => [...prev, emptyTracking()])}
          >
            {t('shipments.addTracking')}
          </Button>
        </div>
        {trackings.map((tr) => (
          <div key={tr.key} className="grid grid-cols-1 gap-2 rounded border border-neutral-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Field label={t('shipments.carrier')} required>
              <Input value={tr.carrier} onChange={(_, d) => setTracking(tr.key, 'carrier', d.value)} />
            </Field>
            <Field label={t('shipments.trackingNo')} required>
              <Input
                value={tr.trackingNo}
                onChange={(_, d) => setTracking(tr.key, 'trackingNo', d.value)}
              />
            </Field>
            <Field label={t('shipments.trackingNote')}>
              <Input value={tr.note} onChange={(_, d) => setTracking(tr.key, 'note', d.value)} />
            </Field>
            <div className="flex items-end">
              <Button
                size="small"
                appearance="subtle"
                disabled={trackings.length <= 1}
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
          <Text as="h2" weight="semibold" size={400}>
            {t('shipments.items')}
          </Text>
          <div className="flex items-center gap-2">
            <RefreshButton queryKey={['items', 'picker']} additionalKeys={[['units', 'list']]} />
            <Input
              value={itemSearch}
              placeholder={t('shipments.itemSearchPlaceholder')}
              onChange={(_, d) => setItemSearch(d.value)}
              className="min-w-44"
            />
            <Link to="/items/new" target="_blank" rel="noopener noreferrer">
              <Button size="small" appearance="secondary">
                {t('shipments.newItem')}
              </Button>
            </Link>
            <Button
              size="small"
              appearance="secondary"
              onClick={() => setLines((prev) => [...prev, emptyItem()])}
            >
              {t('shipments.addItem')}
            </Button>
          </div>
        </div>
        {lines.map((line) => (
          <div key={line.key} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label={t('shipments.itemName')} required className="sm:col-span-1">
                <Select value={line.itemId} onChange={(_, d) => pickItem(line.key, d.value)}>
                  <option value="">{t('shipments.selectItem')}</option>
                  {(itemPage?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sku ? ` · ${item.sku}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={
                  line.spec ? `${t('shipments.expectedQty')} ${t(`items.specUnits.${line.spec}`)}` : t('shipments.expectedQty')
                }
                required
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={line.expectedQty}
                  onChange={(_, d) => setLine(line.key, 'expectedQty', sanitizeIntegerInput(d.value))}
                />
              </Field>
              <Field label={t('shipments.unitPrice')}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(_, d) => setLine(line.key, 'unitPrice', sanitizeDecimalInput(d.value))}
                />
              </Field>
            </div>
            {line.isPerishable && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label={t('shipments.productionDate')} required>
                  <Input
                    type="date"
                    value={line.productionDate}
                    onChange={(_, d) => setLine(line.key, 'productionDate', d.value)}
                  />
                </Field>
                <Field label={t('shipments.expiryDate')} required>
                  <Input
                    type="date"
                    value={line.expiryDate}
                    onChange={(_, d) => setLine(line.key, 'expiryDate', d.value)}
                  />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Field label={t('shipments.lineNote')}>
                <Input
                  value={line.lineNote}
                  onChange={(_, d) => setLine(line.key, 'lineNote', d.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  size="small"
                  appearance="subtle"
                  disabled={lines.length <= 1}
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== line.key))}
                >
                  {t('shipments.remove')}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          appearance="primary"
          disabled={saving || !form.shipperUnitId || !form.receiverUnitId}
          onClick={() => void submit()}
        >
          {t('shipments.save')}
        </Button>
        <Link to={isEdit ? `/shipments/${params.id}` : '/shipments'}>
          <Button appearance="secondary" disabled={saving}>
            {t('shipments.cancel')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
