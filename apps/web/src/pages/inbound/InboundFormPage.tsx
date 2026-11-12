import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import type { InboundManualCreateInput, ItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { createManualInbound, postInbound } from '../../api/inbound';
import { listItems } from '../../api/items';
import { listUnits } from '../../api/units';
import { refreshAfterWrite } from '../../api/queryClient';
import { RefreshButton } from '../../components/RefreshButton';
import { FIELD_OVERFLOW_GUARD, LINE_GRID_CLASS } from '../../components/lineGrid';
import { useSession } from '../../auth/SessionProvider';
import { specUnitOf, unitLabel } from '../../i18n/units';
import { Button } from '../../ui/button';
import { EntityPicker, type PickerOption } from '../../ui/entity-picker';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Textarea } from '../../ui/textarea';

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
  // 每行选择器触发器上显示的文本（物品名）：选中后写入，EntityPicker 的 value 仍然只存 itemId。
  const [lineQueries, setLineQueries] = useState<Record<string, string>>({});
  // 选择器搜到的物品按 id 留档：选中后要用 isPerishable / 单位回填，
  // 不能回头去「当前这一页结果」里找——那一页随时会被下一次搜索替换掉。
  const [itemIndex, setItemIndex] = useState<Record<string, ItemDto>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units', 'list'],
    queryFn: () => listUnits(),
  });

  // 搜索走服务端（EntityPicker 每次改词/翻页都调这里）：物品再多也能搜到，
  // 不再是「只筛第一页 50 条」。
  const searchItems = async (query: string, page: number) => {
    const data = await listItems({ q: query || undefined, page, size: 50 });
    setItemIndex((prev) => {
      const next = { ...prev };
      for (const item of data.items) next[item.id] = item;
      return next;
    });
    return {
      items: data.items.map((item) => ({
        id: item.id,
        label: item.name,
        meta: [item.sku, unitLabel(t, specUnitOf(item), item.minSaleUnit)].filter(Boolean).join(' · '),
      })),
      total: data.total,
    };
  };

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
  const pickItem = (key: string, option: PickerOption) => {
    const isPerishable = itemIndex[option.id]?.isPerishable ?? false;
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              itemId: option.id,
              isPerishable,
              productionDate: isPerishable ? l.productionDate : '',
              expiryDate: isPerishable ? l.expiryDate : '',
            }
          : l,
      ),
    );
  };

  // 至少保留一行，避免提交空清单。
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

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
      void refreshAfterWrite(queryClient);
      navigate(`/inbound/${created.id}`);
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  if (unitsLoading) return <Spinner label={t('common.loading')} />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title={t('inbound.manualCreateTitle')} />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      <div className={`grid grid-cols-1 items-start gap-4 sm:grid-cols-2 ${FIELD_OVERFLOW_GUARD}`}>
        <Field label={t('inbound.warehouse')} required>
          <Select
            value={warehouseUnitId}
            onValueChange={setWarehouseUnitId}
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
          <Select value={counterpartyUnitId} onValueChange={setCounterpartyUnitId}>
            <option value="">—</option>
            {counterparties.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('inbound.remark')} className="sm:col-span-2">
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">{t('inbound.items')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton queryKey={['items']} additionalKeys={[['units', 'list']]} />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              {t('inbound.addLine')}
            </Button>
          </div>
        </div>

        {lines.map((line, index) => {
          const item = itemIndex[line.itemId];
          const unit = specUnitOf(item);
          const unitSuffix = unit ? ` (${unitLabel(t, unit, item?.minSaleUnit)})` : '';

          return (
            <div
              key={line.key}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3"
            >
              <div className={`${LINE_GRID_CLASS} sm:grid-cols-3`}>
                <Field label={t('inbound.itemName')} required>
                  <EntityPicker
                    value={line.itemId}
                    displayValue={lineQueries[line.key]}
                    title={t('items.title')}
                    searchPlaceholder={t('items.itemSearchPlaceholder')}
                    onSearch={searchItems}
                    onChange={(option) => {
                      pickItem(line.key, option);
                      setLineQueries((prev) => ({ ...prev, [line.key]: option.label }));
                    }}
                    className="w-full min-w-0"
                  />
                </Field>
                <Field label={`${t('inbound.qty')}${unitSuffix}`} required>
                  <Input
                    type="number"
                    min={0}
                    value={line.qty}
                    onChange={(e) => setLine(line.key, 'qty', e.target.value)}
                  />
                </Field>
                <Field label={t('inbound.unitCost')}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unitCost}
                    onChange={(e) => setLine(line.key, 'unitCost', e.target.value)}
                  />
                </Field>
              </div>

              <div
                className={`${LINE_GRID_CLASS} ${line.isPerishable ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}
              >
                <Field label={t('inbound.batchNo')}>
                  <Input
                    value={line.batchNo}
                    placeholder={t('inbound.batchNoPlaceholder')}
                    onChange={(e) => setLine(line.key, 'batchNo', e.target.value)}
                  />
                </Field>
                {line.isPerishable && (
                  <>
                    <Field label={t('inbound.productionDate')}>
                      <Input
                        type="date"
                        value={line.productionDate}
                        onChange={(e) => setLine(line.key, 'productionDate', e.target.value)}
                      />
                    </Field>
                    <Field label={t('inbound.expiryDate')}>
                      <Input
                        type="date"
                        value={line.expiryDate}
                        onChange={(e) => setLine(line.key, 'expiryDate', e.target.value)}
                      />
                    </Field>
                  </>
                )}
                <Field label={t('inbound.lineNote')}>
                  <Input
                    value={line.lineNote}
                    onChange={(e) => setLine(line.key, 'lineNote', e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  // 每行一个图标按钮：把行标识拼进可访问名称（物品名，未选时退行号）。
                  aria-label={`${t('common.remove')} ${lineQueries[line.key] || index + 1}`}
                  icon={<Trash2 aria-hidden className="size-4" />}
                  disabled={lines.length === 1}
                  onClick={() => removeLine(line.key)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('inbound.createAndPost')}
        </Button>
        <Button
          asChild
          variant="secondary"
          className={saving ? 'pointer-events-none opacity-50' : undefined}
        >
          <Link to="/inbound">{t('inbound.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
