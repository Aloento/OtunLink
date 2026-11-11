import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FileDto, ShipmentDetailDto, ShipmentItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { saveCount, submitReview, type ShipmentCountLineInput } from '../../api/shipments';
import { ResponsiveTable, type ResponsiveTableColumn } from '../ResponsiveTable';
import { ImageUpload } from '../ImageUpload';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardHeader } from '../../ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

// 收货点货面板：SENT → 开始点货；COUNTING/DISCREPANCY → 逐项录实收
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
          type="number"
          min={0}
          step={1}
          value={drafts[item.id] ?? ''}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
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
          return <span className="text-xs text-ink-subtle">{t('shipments.counting.notCounted')}</span>;
        }
        const diff = Number(value) - Number(item.expectedQty);
        if (diff === 0) return <Badge tone="success">✓</Badge>;
        return (
          <Badge tone="danger">
            {diff > 0 ? '+' : ''}
            {diff}
          </Badge>
        );
      },
    },
  ];

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader
        className="mb-0"
        title={t('shipments.counting.title')}
        actions={
          <>
            <Button variant="secondary" loading={saving} disabled={saving || submitting} onClick={() => void handleSave()}>
              {t('shipments.counting.saveDraft')}
            </Button>
            {shipment.status === 'DISCREPANCY' && canSubmitReview && (
              <Button variant="primary" disabled={saving || submitting} onClick={() => void handleOpenSubmit()}>
                {t('shipments.counting.submitReview')}
              </Button>
            )}
          </>
        }
      />

      {shipment.status === 'DISCREPANCY' && (
        <p className="text-sm text-warning-700">
          {t('shipments.counting.hasDifference', { count: differenceItems.length })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      <ResponsiveTable
        columns={columns}
        items={shipment.items}
        rowKey={(item) => item.id}
        emptyText={t('shipments.noItems')}
        label={t('shipments.counting.title')}
      />

      <Dialog
        open={submitOpen}
        onOpenChange={(next) => {
          setSubmitOpen(next);
          if (!next) setStaged(null);
        }}
        closeLabel={t('common.close')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reviews.submitTitle')}</DialogTitle>
            <DialogDescription>
              {t('shipments.counting.hasDifference', { count: differenceItems.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {differenceItems.map((item, index) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{item.name}</div>
                        <p className="text-xs text-ink-muted">
                          {t('shipments.expectedQty')}: {item.expectedQty} →{' '}
                          {t('shipments.counting.actualQty')}: {item.actualQty}
                        </p>
                      </div>
                      <Badge tone="danger" className="shrink-0">
                        {qtyDiff(item) > 0 ? '+' : ''}
                        {qtyDiff(item)}
                      </Badge>
                    </div>
                    <Textarea
                      placeholder={t('reviews.lineReasonPlaceholder')}
                      aria-label={`${t('reviews.lineReasonPlaceholder')} ${item.name}`}
                      value={lineReasons[item.id] ?? ''}
                      data-autofocus={index === 0 ? true : undefined}
                      onChange={(e) =>
                        setLineReasons((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <Textarea
                placeholder={t('reviews.overallReasonPlaceholder')}
                aria-label={t('reviews.overallReasonPlaceholder')}
                value={overallReason}
                data-autofocus={differenceItems.length === 0 ? true : undefined}
                onChange={(e) => setOverallReason(e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <p className="text-sm text-ink-soft">{t('reviews.photos')}</p>
                <ImageUpload value={photos} onChange={setPhotos} />
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-danger-600">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" disabled={submitting} onClick={() => setSubmitOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void handleSubmit()}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function qtyDiff(item: ShipmentItemDto): number {
  return Number(item.actualQty) - Number(item.expectedQty);
}
