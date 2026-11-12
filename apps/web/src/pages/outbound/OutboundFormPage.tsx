import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { FileDto, ItemDto, OutboundCreateInput, OutboundType } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { listItems } from '../../api/items';
import { createOutboundOrder, getOutboundOrder, updateOutboundOrder } from '../../api/outbound';
import { listStock } from '../../api/stock';
import { listUnits } from '../../api/units';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { specUnitOf, unitLabel } from '../../i18n/units';
import { ImageUpload } from '../../components/ImageUpload';
import { RefreshButton } from '../../components/RefreshButton';
import { FIELD_OVERFLOW_GUARD, LINE_GRID_CLASS } from '../../components/lineGrid';
import { Button } from '../../ui/button';
import { EntityPicker } from '../../ui/entity-picker';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Textarea } from '../../ui/textarea';

interface ItemLine {
  key: string;
  itemId: string;
  qty: string;
  batchId: string;
}

let nextKey = 1;
function genKey(prefix: string): string {
  nextKey += 1;
  return `${prefix}-${nextKey}`;
}

function emptyLine(): ItemLine {
  return { key: genKey('l'), itemId: '', qty: '', batchId: '' };
}

/** 编辑模式回填时，将后端返回的 fileId 列表转成 ImageUpload 所需的 FileDto（仅 id 有效，渲染走预签名 URL）。 */
function fileIdsToDtos(ids: string[]): FileDto[] {
  return ids.map((id) => ({
    id,
    key: '',
    thumbnailKey: null,
    mime: '',
    size: 0,
    width: null,
    height: null,
    hasThumbnail: false,
    createdAt: '',
  }));
}

/** 解析 ?prefill=<json> 为行（「已过期」Tab 一键报损预填：物品 + 数量 + 批次）。 */
function parsePrefill(raw: string | null): ItemLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ itemId?: string; qty?: string | number; batchId?: string }>;
    const lines = parsed
      .filter((p) => p.itemId && p.qty !== undefined && p.qty !== '' && p.batchId)
      .map((p) => ({
        key: genKey('l'),
        itemId: p.itemId!,
        qty: String(p.qty),
        batchId: p.batchId!,
      }));
    return lines;
  } catch {
    return [];
  }
}

// 手工出库单新建：普通出库 + 报损出库（原因/附图/每行批次必填）。
export function OutboundFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const params = useParams<{ id: string }>();
  const isEdit = Boolean(params.id);
  const { me } = useSession();

  const [outboundType, setOutboundType] = useState<OutboundType>(() =>
    searchParams.get('type') === 'LOSS' ? 'LOSS' : 'NORMAL',
  );
  const [warehouseUnitId, setWarehouseUnitId] = useState(() => searchParams.get('warehouseUnitId') ?? '');
  const [counterpartyUnitId, setCounterpartyUnitId] = useState('');
  const [lossReason, setLossReason] = useState(() => searchParams.get('reason') ?? '');
  const [photos, setPhotos] = useState<FileDto[]>([]);
  const [remark, setRemark] = useState('');
  const [lines, setLines] = useState<ItemLine[]>(() => {
    const prefilled = parsePrefill(searchParams.get('prefill'));
    return prefilled.length > 0 ? prefilled : [emptyLine()];
  });
  // 每行选择器触发器上显示的文本（物品名）：选中后写入，编辑态回填时由详情补齐。
  const [lineQueries, setLineQueries] = useState<Record<string, string>>({});
  // 选择器搜到的物品按 id 留档：选中后要用单位回填数量标签，
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

  const { data: stockPage, isLoading: stockLoading } = useQuery({
    queryKey: ['stock', 'batchPicker', warehouseUnitId],
    queryFn: () => listStock({ unitId: warehouseUnitId, size: 100 }),
    enabled: Boolean(warehouseUnitId),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['outbound-orders', params.id],
    queryFn: () => getOutboundOrder(params.id!),
    enabled: isEdit,
  });

  const warehouses = useMemo(
    () => (units ?? []).filter((u) => u.type === 'WAREHOUSE' && u.isActive),
    [units],
  );
  const counterparties = useMemo(
    () => (units ?? []).filter((u) => u.isActive && u.id !== warehouseUnitId),
    [units, warehouseUnitId],
  );

  useEffect(() => {
    if (warehouseUnitId) return;
    if (me?.scopeUnitId) {
      setWarehouseUnitId(me.scopeUnitId);
      return;
    }
    if (warehouses.length === 1) setWarehouseUnitId(warehouses[0].id);
  }, [warehouseUnitId, me?.scopeUnitId, warehouses]);

  // 编辑：回填草稿出库单详情。
  useEffect(() => {
    if (!detail) return;
    setOutboundType(detail.type);
    setWarehouseUnitId(detail.warehouseUnitId);
    setCounterpartyUnitId(detail.counterpartyUnitId ?? '');
    setLossReason(detail.lossReason ?? '');
    setPhotos(fileIdsToDtos(detail.photoFileIds));
    setRemark(detail.remark ?? '');
    const restored = detail.items.map((item) => ({
      key: genKey('l'),
      itemId: item.itemId,
      qty: item.qty,
      batchId: item.batchId ?? '',
    }));
    setLines(restored);
    // 每行物品选择器的显示文本要一起回填，否则编辑态看到的是「未选择」（后端 DTO 带 itemName）。
    setLineQueries(
      Object.fromEntries(
        restored.map((line, index) => [line.key, detail.items[index]?.itemName ?? '']),
      ),
    );
  }, [detail]);

  const stockRows = stockPage?.items ?? [];

  // 每个 batchId 与每个 itemId 的可用量（各批次 qty 之和）。
  const batchAvailable = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stockRows) {
      map.set(row.batchId, (map.get(row.batchId) ?? 0) + Number(row.qty));
    }
    return map;
  }, [stockRows]);

  const itemAvailable = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of stockRows) {
      map.set(row.itemId, (map.get(row.itemId) ?? 0) + Number(row.qty));
    }
    return map;
  }, [stockRows]);

  // 指定批次用该批次可用量，未指定（FEFO）用物品总可用量；库存未加载时返回 null（跳过校验）。
  const availableFor = (line: ItemLine): number | null => {
    if (!warehouseUnitId || stockLoading || !line.itemId) return null;
    if (line.batchId) return batchAvailable.get(line.batchId) ?? 0;
    return itemAvailable.get(line.itemId) ?? 0;
  };

  // 行内即时校验：数量超过可用量时返回可用量，否则 null。
  const lineExcess = (line: ItemLine): number | null => {
    if (!line.itemId || !line.qty.trim()) return null;
    const available = availableFor(line);
    if (available === null) return null;
    const qty = Number(line.qty.trim());
    if (Number.isNaN(qty)) return null;
    return qty > available ? available : null;
  };

  const setLine = (key: string, field: keyof ItemLine, value: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  // 至少保留一行，避免提交空清单。
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const buildPayload = (): OutboundCreateInput | null => {
    if (!warehouseUnitId) {
      setError(t('outbound.errors.warehouseRequired'));
      return null;
    }
    if (lines.some((l) => !l.itemId || !l.qty.trim())) {
      setError(t('outbound.errors.itemRequired'));
      return null;
    }
    if (outboundType === 'LOSS') {
      if (!lossReason.trim()) {
        setError(t('outbound.errors.lossReasonRequired'));
        return null;
      }
      if (photos.length < 1) {
        setError(t('outbound.errors.photoRequired'));
        return null;
      }
    }
    if (warehouseUnitId && !stockLoading) {
      for (const l of lines) {
        const excess = lineExcess(l);
        if (excess !== null) {
          setError(t('outbound.errors.insufficient', { available: excess }));
          return null;
        }
      }
    }
    return {
      warehouseUnitId,
      counterpartyUnitId: outboundType === 'NORMAL' ? counterpartyUnitId || null : null,
      type: outboundType,
      lossReason: outboundType === 'LOSS' ? lossReason.trim() : null,
      photoFileIds: outboundType === 'LOSS' ? photos.map((f) => f.id) : undefined,
      remark: remark.trim() || null,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty.trim(),
        batchId: l.batchId || null,
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
        await updateOutboundOrder(id, payload);
        void refreshAfterWrite(queryClient);
        navigate(`/outbound/${id}`);
      } else {
        const created = await createOutboundOrder(payload);
        void refreshAfterWrite(queryClient);
        navigate(`/outbound/${created.id}`);
      }
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  if (unitsLoading || (isEdit && detailLoading)) return <Spinner label={t('common.loading')} />;

  // 头部字段按类型不同（报损多出原因/附图），共用同一段渲染逻辑分别放进各面板。
  const renderHeader = (kind: OutboundType) => (
    <>
      <div className={`grid grid-cols-1 items-start gap-4 sm:grid-cols-2 ${FIELD_OVERFLOW_GUARD}`}>
        <Field label={t('outbound.warehouse')} required>
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
        {kind === 'NORMAL' && (
          <Field label={t('outbound.counterparty')}>
            <Select value={counterpartyUnitId} onValueChange={setCounterpartyUnitId}>
              <option value="">—</option>
              {counterparties.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('outbound.remark')} className="sm:col-span-2">
          <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
        </Field>
      </div>

      {kind === 'LOSS' && (
        <div className="flex flex-col gap-4 rounded-card border border-danger-200 bg-danger-50 p-4">
          <Field label={t('outbound.lossReason')} required>
            <Textarea
              value={lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              rows={3}
              placeholder={t('outbound.lossReasonPlaceholder')}
            />
          </Field>
          <Field label={t('outbound.lossPhotos')} required unlabeled>
            <ImageUpload value={photos} onChange={setPhotos} />
          </Field>
          <p className="text-sm text-danger-600">{t('outbound.lossHint')}</p>
        </div>
      )}
    </>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={
          isEdit
            ? t('outbound.editTitle')
            : outboundType === 'LOSS'
              ? t('outbound.createLossTitle')
              : t('outbound.createTitle')
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      <Tabs
        value={outboundType}
        onValueChange={(next) => setOutboundType(next as OutboundType)}
        className="flex flex-col gap-4"
      >
        <TabsList>
          <TabsTrigger value="NORMAL">{t('outbound.types.NORMAL')}</TabsTrigger>
          <TabsTrigger value="LOSS">{t('outbound.types.LOSS')}</TabsTrigger>
        </TabsList>
        <TabsContent value="NORMAL">{renderHeader('NORMAL')}</TabsContent>
        <TabsContent value="LOSS">{renderHeader('LOSS')}</TabsContent>
      </Tabs>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">{t('outbound.items')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton
              queryKey={['items']}
              additionalKeys={[['stock', 'batchPicker'], ['units', 'list']]}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              {t('outbound.addLine')}
            </Button>
          </div>
        </div>

        {lines.map((line, index) => {
          const batchOptions = (stockPage?.items ?? []).filter((row) => row.itemId === line.itemId);
          const excess = lineExcess(line);
          const item = itemIndex[line.itemId];
          const unit = specUnitOf(item);
          const unitSuffix = unit ? ` (${unitLabel(t, unit, item?.minSaleUnit)})` : '';

          return (
            <div
              key={line.key}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3"
            >
              <div className={`${LINE_GRID_CLASS} sm:grid-cols-3`}>
                <Field label={t('outbound.itemName')} required>
                  <EntityPicker
                    value={line.itemId}
                    displayValue={lineQueries[line.key]}
                    title={t('items.title')}
                    searchPlaceholder={t('items.itemSearchPlaceholder')}
                    onSearch={searchItems}
                    onChange={(option) => {
                      setLine(line.key, 'itemId', option.id);
                      setLineQueries((prev) => ({ ...prev, [line.key]: option.label }));
                    }}
                    className="w-full min-w-0"
                  />
                </Field>
                {/* 超出可用量：只有用户填了数量才可能出现，交给 Field 的 error 走 aria-describedby。 */}
                <Field
                  label={`${t('outbound.qty')}${unitSuffix}`}
                  required
                  error={
                    excess !== null
                      ? t('outbound.errors.insufficient', { available: excess })
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min={0}
                    value={line.qty}
                    onChange={(e) => setLine(line.key, 'qty', e.target.value)}
                  />
                </Field>
                <Field label={t('outbound.batchNo')}>
                  <Select
                    value={line.batchId}
                    onValueChange={(next) => setLine(line.key, 'batchId', next)}
                    disabled={!line.itemId}
                  >
                    <option value="">{t('outbound.fefo')}</option>
                    {batchOptions.map((row) => (
                      <option key={row.batchId} value={row.batchId}>
                        {row.batchNo ?? t('outbound.unnamedBatch', { id: row.batchId.slice(0, 8) })}（{row.qty}）
                      </option>
                    ))}
                  </Select>
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

        {stockLoading && <Spinner size="sm" label={t('common.loading')} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('outbound.create')}
        </Button>
        <Button
          asChild
          variant="secondary"
          className={saving ? 'pointer-events-none opacity-50' : undefined}
        >
          <Link to={isEdit ? `/outbound/${params.id}` : '/outbound'}>{t('outbound.cancel')}</Link>
        </Button>
      </div>
    </div>
  );
}
