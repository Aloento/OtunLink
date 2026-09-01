import { Button, Field, Input, Select, Spinner, Text, Textarea, Title1 } from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import type { InboundManualCreateInput } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { createManualInbound, postInbound } from '../../api/inbound';
import { listItems } from '../../api/items';
import { listUnits } from '../../api/units';
import { useSession } from '../../auth/SessionProvider';

interface ItemLine {
  key: string;
  itemId: string;
  qty: string;
  unitCost: string;
  batchNo: string;
  isPerishable: boolean;
  productionDate: string;
  expiryDate: string;
  lineNote: string;
}

let nextKey = 1;
function genKey(prefix: string): string {
  nextKey += 1;
  return `${prefix}-${nextKey}`;
}

function emptyLine(): ItemLine {
  return {
    key: genKey('l'),
    itemId: '',
    qty: '',
    unitCost: '',
    batchNo: '',
    isPerishable: false,
    productionDate: '',
    expiryDate: '',
    lineNote: '',
  };
}

// 手工入库单新建：指定仓库/交易对手/行（物品 + 数量 + 成本单价 + 可选批次）。
export function InboundFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useSession();

  const [warehouseUnitId, setWarehouseUnitId] = useState('');
  const [counterpartyUnitId, setCounterpartyUnitId] = useState('');
  const [remark, setRemark] = useState('');
  const [lines, setLines] = useState<ItemLine[]>([emptyLine()]);
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

  const warehouses = useMemo(
    () => (units ?? []).filter((u) => u.type === 'WAREHOUSE' && u.isActive),
    [units],
  );
  const counterparties = useMemo(
    () => (units ?? []).filter((u) => u.isActive && u.id !== warehouseUnitId),
    [units, warehouseUnitId],
  );

  // scope 非空时仓库锁定为本单元。
  useEffect(() => {
    if (warehouseUnitId) return;
    if (me?.scopeUnitId) {
      setWarehouseUnitId(me.scopeUnitId);
      return;
    }
    if (warehouses.length === 1) setWarehouseUnitId(warehouses[0].id);
  }, [warehouseUnitId, me?.scopeUnitId, warehouses]);

  const setLine = (key: string, field: keyof ItemLine, value: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  // 切换物品：同步易腐标记；切到非易腐物品时清空其生产/到期日期。
  const pickItem = (key: string, itemId: string) => {
    const item = (itemPage?.items ?? []).find((i) => i.id === itemId);
    const isPerishable = item?.isPerishable ?? false;
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              itemId,
              isPerishable,
              productionDate: isPerishable ? l.productionDate : '',
              expiryDate: isPerishable ? l.expiryDate : '',
            }
          : l,
      ),
    );
  };

  const buildPayload = (): InboundManualCreateInput | null => {
    if (!warehouseUnitId) {
      setError(t('outbound.errors.warehouseRequired'));
      return null;
    }
    if (lines.some((l) => !l.itemId || !l.qty.trim())) {
      setError(t('outbound.errors.itemRequired'));
      return null;
    }
    const payload: InboundManualCreateInput = {
      warehouseUnitId,
      counterpartyUnitId: counterpartyUnitId || null,
      remark: remark.trim() || null,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty.trim(),
        unitCost: l.unitCost.trim() || null,
        batchNo: l.batchNo.trim() || null,
        productionDate: l.isPerishable ? l.productionDate || null : null,
        expiryDate: l.isPerishable ? l.expiryDate || null : null,
        lineNote: l.lineNote.trim() || null,
      })),
    };
    return payload;
  };

  const submit = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createManualInbound(payload);
      // 创建即过账：建档批次 + 写库存（也可在详情页手动过账）。
      await postInbound(created.id);
      void queryClient.invalidateQueries({ queryKey: ['inbound-orders'] });
      navigate(`/inbound/${created.id}`);
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  if (unitsLoading) return <Spinner label={t('common.loading')} />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Title1 as="h1">{t('inbound.manualCreateTitle')}</Title1>

      {error && <Text className="text-red-600">{error}</Text>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('inbound.warehouse')} required>
          <Select
            value={warehouseUnitId}
            onChange={(_, d) => setWarehouseUnitId(d.value)}
            disabled={Boolean(me?.scopeUnitId)}
          >
            <option value="">—</option>
            {warehouses.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('inbound.counterparty')}>
          <Select value={counterpartyUnitId} onChange={(_, d) => setCounterpartyUnitId(d.value)}>
            <option value="">—</option>
            {counterparties.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('inbound.remark')} className="sm:col-span-2">
          <Textarea value={remark} onChange={(_, d) => setRemark(d.value)} rows={2} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text as="h2" weight="semibold" size={400}>
            {t('inbound.items')}
          </Text>
          <div className="flex items-center gap-2">
            <Input
              value={itemSearch}
              placeholder={t('items.itemSearchPlaceholder')}
              onChange={(_, d) => setItemSearch(d.value)}
              className="min-w-44"
            />
            <Button
              size="small"
              appearance="secondary"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              {t('inbound.addLine')}
            </Button>
          </div>
        </div>
        {lines.map((line) => (
          <div key={line.key} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label={t('inbound.itemName')} required>
                <Select value={line.itemId} onChange={(_, d) => pickItem(line.key, d.value)}>
                  <option value="">—</option>
                  {(itemPage?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sku ? ` · ${item.sku}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('inbound.qty')} required>
                <Input
                  type="number"
                  min={0}
                  value={line.qty}
                  onChange={(_, d) => setLine(line.key, 'qty', d.value)}
                />
              </Field>
              <Field label={t('inbound.unitCost')}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unitCost}
                  onChange={(_, d) => setLine(line.key, 'unitCost', d.value)}
                />
              </Field>
            </div>
            <div className={`grid grid-cols-1 gap-2 ${line.isPerishable ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
              <Field label={t('inbound.batchNo')}>
                <Input
                  value={line.batchNo}
                  placeholder={t('inbound.batchNoPlaceholder')}
                  onChange={(_, d) => setLine(line.key, 'batchNo', d.value)}
                />
              </Field>
              {line.isPerishable && (
                <>
                  <Field label={t('inbound.productionDate')}>
                    <Input
                      type="date"
                      value={line.productionDate}
                      onChange={(_, d) => setLine(line.key, 'productionDate', d.value)}
                    />
                  </Field>
                  <Field label={t('inbound.expiryDate')}>
                    <Input
                      type="date"
                      value={line.expiryDate}
                      onChange={(_, d) => setLine(line.key, 'expiryDate', d.value)}
                    />
                  </Field>
                </>
              )}
              <Field label={t('inbound.lineNote')}>
                <Input
                  value={line.lineNote}
                  onChange={(_, d) => setLine(line.key, 'lineNote', d.value)}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button appearance="primary" disabled={saving} onClick={() => void submit()}>
          {saving ? <Spinner size="tiny" /> : t('inbound.createAndPost')}
        </Button>
        <Link to="/inbound">
          <Button appearance="secondary" disabled={saving}>
            {t('inbound.cancel')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
