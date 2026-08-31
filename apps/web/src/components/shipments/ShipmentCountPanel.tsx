import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
  Text,
  Textarea,
} from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FileDto, ShipmentDetailDto, ShipmentItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { saveCount, submitReview, type ShipmentCountLineInput } from '../../api/shipments';
import { ImageUpload } from '../ImageUpload';
import { ResponsiveTable, type ResponsiveTableColumn } from '../ResponsiveTable';

// 收货点货面板（ck-06 §5.1）：SENT → 开始点货；COUNTING/DISCREPANCY → 逐项录实收
// + 保存草稿（带版本号）；DISCREPANCY → 提交差异修订（逐行原因 + 照片）。
export function ShipmentCountPanel({
  shipment,
  canCount,
  canSubmitReview,
  onRefresh,
}: {
  shipment: ShipmentDetailDto;
  canCount: boolean;
  canSubmitReview: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lineReasons, setLineReasons] = useState<Record<string, string>>({});
  const [overallReason, setOverallReason] = useState('');
  const [photos, setPhotos] = useState<FileDto[]>([]);
  /** 提交 Dialog 前落盘的版本（确保差异展示与服务端一致）。 */
  const [staged, setStaged] = useState<ShipmentDetailDto | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of shipment.items) next[item.id] = item.actualQty ?? '';
    setDrafts(next);
  }, [shipment.id, shipment.countVersion, shipment.items]);

  const isCountable = shipment.status === 'COUNTING' || shipment.status === 'DISCREPANCY';
  const filledLines = shipment.items
    .map((item) => ({ item, value: (drafts[item.id] ?? '').trim() }))
    .filter(({ value }) => value !== '');

  const handleSave = async (): Promise<ShipmentDetailDto | null> => {
    if (filledLines.length === 0) {
      setError(t('shipments.counting.needAtLeastOne'));
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveCount(shipment.id, {
        version: shipment.countVersion,
        items: filledLines.map(
          ({ item, value }): ShipmentCountLineInput => ({
            shipmentItemId: item.id,
            actualQty: value,
          }),
        ),
      });
      onRefresh();
      return result.shipment;
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  /** 提交前先落盘草稿，确保 Dialog 展示的差异与服务端一致。 */
  const handleOpenSubmit = async () => {
    const saved = await handleSave();
    if (saved) {
      setStaged(saved);
      setSubmitOpen(true);
    }
  };

  const view = staged ?? shipment;
  const differenceItems = view.items.filter(
    (item) => item.actualQty !== null && item.actualQty !== '' && qtyDiff(item) !== 0,
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitReview(shipment.id, {
        items: differenceItems.map((item) => ({
          shipmentItemId: item.id,
          reason: lineReasons[item.id]?.trim() || null,
        })),
        reason: overallReason.trim() || null,
        photoFileIds: photos.map((f) => f.id),
      });
      setSubmitOpen(false);
      setStaged(null);
      setLineReasons({});
      setOverallReason('');
      setPhotos([]);
      onRefresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCount || !isCountable) return null;

  const columns: ResponsiveTableColumn<ShipmentItemDto>[] = [
    { key: 'name', header: t('shipments.itemName'), render: (item) => item.name },
    { key: 'expected', header: t('shipments.expectedQty'), render: (item) => item.expectedQty },
    {
      key: 'actual',
      header: t('shipments.counting.actualQty'),
      render: (item) => (
        <Input
          appearance="underline"
          type="number"
          min={0}
          step={1}
          value={drafts[item.id] ?? ''}
          onChange={(_e, data) => setDrafts((prev) => ({ ...prev, [item.id]: data.value }))}
          className="w-24"
          aria-label={`${t('shipments.counting.actualQty')} ${item.name}`}
        />
      ),
    },
    {
      key: 'diff',
      header: t('shipments.counting.difference'),
      render: (item) => {
        const value = (drafts[item.id] ?? '').trim();
        if (value === '') {
          return (
            <Text size={200} className="text-neutral-400">
              {t('shipments.counting.notCounted')}
            </Text>
          );
        }
        const diff = Number(value) - Number(item.expectedQty);
        if (diff === 0) return <Badge appearance="tint" color="success">✓</Badge>;
        return (
          <Badge appearance="tint" color="danger">
            {diff > 0 ? '+' : ''}
            {diff}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" weight="semibold" size={400}>
          {t('shipments.counting.title')}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          <Button appearance="secondary" disabled={saving || submitting} onClick={() => void handleSave()}>
            {saving ? <Spinner size="tiny" /> : t('shipments.counting.saveDraft')}
          </Button>
          {shipment.status === 'DISCREPANCY' && canSubmitReview && (
            <Button appearance="primary" disabled={saving || submitting} onClick={() => void handleOpenSubmit()}>
              {t('shipments.counting.submitReview')}
            </Button>
          )}
        </div>
      </div>

      {shipment.status === 'DISCREPANCY' && (
        <Text className="text-amber-700">
          {t('shipments.counting.hasDifference', { count: differenceItems.length })}
        </Text>
      )}
      {error && <Text className="text-red-600">{error}</Text>}

      <ResponsiveTable
        columns={columns}
        items={shipment.items}
        rowKey={(item) => item.id}
        emptyText={t('shipments.noItems')}
      />

      <Dialog
        open={submitOpen}
        onOpenChange={(_e, data) => {
          setSubmitOpen(data.open);
          if (!data.open) setStaged(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('reviews.submitTitle')}</DialogTitle>
            <DialogContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  {differenceItems.map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <Text size={200} className="text-neutral-500">
                            {t('shipments.expectedQty')}: {item.expectedQty} →{' '}
                            {t('shipments.counting.actualQty')}: {item.actualQty}
                          </Text>
                        </div>
                        <Badge appearance="tint" color="danger">
                          {qtyDiff(item) > 0 ? '+' : ''}
                          {qtyDiff(item)}
                        </Badge>
                      </div>
                      <Textarea
                        placeholder={t('reviews.lineReasonPlaceholder')}
                        value={lineReasons[item.id] ?? ''}
                        onChange={(_e, data) =>
                          setLineReasons((prev) => ({ ...prev, [item.id]: data.value }))
                        }
                        resize="vertical"
                      />
                    </div>
                  ))}
                </div>
                <Textarea
                  placeholder={t('reviews.overallReasonPlaceholder')}
                  value={overallReason}
                  onChange={(_e, data) => setOverallReason(data.value)}
                  resize="vertical"
                />
                <div className="flex flex-col gap-1">
                  <Text size={300}>{t('reviews.photos')}</Text>
                  <ImageUpload value={photos} onChange={setPhotos} />
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" disabled={submitting} onClick={() => setSubmitOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button appearance="primary" disabled={submitting} onClick={() => void handleSubmit()}>
                {submitting ? <Spinner size="tiny" /> : t('common.confirm')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function qtyDiff(item: ShipmentItemDto): number {
  return Number(item.actualQty) - Number(item.expectedQty);
}
