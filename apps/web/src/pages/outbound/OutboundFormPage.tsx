import {
  Button,
  Field,
  Input,
  Select,
  Spinner,
  Tab,
  TabList,
  Text,
  Textarea,
  Title1,
} from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { FileDto, OutboundCreateInput, OutboundType } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { listItems } from '../../api/items';
import { createOutboundOrder, getOutboundOrder, updateOutboundOrder } from '../../api/outbound';
import { listStock } from '../../api/stock';
import { listUnits } from '../../api/units';
import { useSession } from '../../auth/SessionProvider';
import { ImageUpload } from '../../components/ImageUpload';

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

  const { data: stockPage, isLoading: stockLoading } = useQuery({
    queryKey: ['stock', 'batchPicker', warehouseUnitId],
    queryFn: () => listStock({ unitId: warehouseUnitId, size: 100 }),
    enabled: Boolean(warehouseUnitId),
    staleTime: 30_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['outbound-orders', params.id],
    queryFn: () => getOutboundOrder(params.id!),
    enabled: isEdit,
    staleTime: 15_000,
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
    setLines(
      detail.items.map((item) => ({
        key: genKey('l'),
        itemId: item.itemId,
        qty: item.qty,
        batchId: item.batchId ?? '',
      })),
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
        void queryClient.invalidateQueries({ queryKey: ['outbound-orders'] });
        navigate(`/outbound/${id}`);
      } else {
        const created = await createOutboundOrder(payload);
        void queryClient.invalidateQueries({ queryKey: ['outbound-orders'] });
        navigate(`/outbound/${created.id}`);
      }
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  if (unitsLoading || (isEdit && detailLoading)) return <Spinner label={t('common.loading')} />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Title1 as="h1">
        {isEdit
          ? t('outbound.editTitle')
          : outboundType === 'LOSS'
            ? t('outbound.createLossTitle')
            : t('outbound.createTitle')}
      </Title1>

      <TabList
        selectedValue={outboundType}
        onTabSelect={(_, d) => setOutboundType(d.value as OutboundType)}
      >
        <Tab value="NORMAL">{t('outbound.types.NORMAL')}</Tab>
        <Tab value="LOSS">{t('outbound.types.LOSS')}</Tab>
      </TabList>

      {error && <Text className="text-red-600">{error}</Text>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('outbound.warehouse')} required>
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
        {outboundType === 'NORMAL' && (
          <Field label={t('outbound.counterparty')}>
            <Select value={counterpartyUnitId} onChange={(_, d) => setCounterpartyUnitId(d.value)}>
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
          <Textarea value={remark} onChange={(_, d) => setRemark(d.value)} rows={2} />
        </Field>
      </div>

      {outboundType === 'LOSS' && (
        <div className="flex flex-col gap-4 rounded border border-red-200 bg-red-50/40 p-4">
          <Field label={t('outbound.lossReason')} required>
            <Textarea
              value={lossReason}
              onChange={(_, d) => setLossReason(d.value)}
              rows={3}
              placeholder={t('outbound.lossReasonPlaceholder')}
            />
          </Field>
          <Field label={t('outbound.lossPhotos')} required>
            <ImageUpload value={photos} onChange={setPhotos} />
          </Field>
          <Text size={200} className="text-red-700">
            {t('outbound.lossHint')}
          </Text>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text as="h2" weight="semibold" size={400}>
            {t('outbound.items')}
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
              {t('outbound.addLine')}
            </Button>
          </div>
        </div>
        {lines.map((line) => {
          const batchOptions = (stockPage?.items ?? []).filter((row) => row.itemId === line.itemId);
          const excess = lineExcess(line);
          return (
            <div
              key={line.key}
              className="flex flex-col gap-2 rounded border border-neutral-200 p-3"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field label={t('outbound.itemName')} required>
                  <Select value={line.itemId} onChange={(_, d) => setLine(line.key, 'itemId', d.value)}>
                    <option value="">—</option>
                    {(itemPage?.items ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.sku ? ` · ${item.sku}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('outbound.qty')} required>
                  <Input
                    type="number"
                    min={0}
                    value={line.qty}
                    onChange={(_, d) => setLine(line.key, 'qty', d.value)}
                  />
                </Field>
                <Field label={t('outbound.batchNo')}>
                  <Select
                    value={line.batchId}
                    onChange={(_, d) => setLine(line.key, 'batchId', d.value)}
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
              {excess !== null && (
                <Text className="text-red-600">
                  {t('outbound.errors.insufficient', { available: excess })}
                </Text>
              )}
            </div>
          );
        })}
        {stockLoading && <Spinner size="tiny" label={t('common.loading')} />}
      </div>

      <div className="flex items-center gap-3">
        <Button appearance="primary" disabled={saving} onClick={() => void submit()}>
          {saving ? <Spinner size="tiny" /> : t('outbound.create')}
        </Button>
        <Link to={isEdit ? `/outbound/${params.id}` : '/outbound'}>
          <Button appearance="secondary" disabled={saving}>
            {t('outbound.cancel')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
