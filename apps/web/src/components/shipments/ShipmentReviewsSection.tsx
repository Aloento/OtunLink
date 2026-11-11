import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DiscrepancyReviewDto, ShipmentDetailDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { approveReview, rejectReview } from '../../api/shipments';
import { formatDateTime } from '../../i18n/format';
import { useLocale } from '../../i18n/LocaleProvider';
import { FileImage } from '../FileImage';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';

// 差异修订记录区：仓库提交后在此展示；集货方在此审批（同意/拒绝）。
export function ShipmentReviewsSection({
  shipment,
  canSubmitReview,
  canApproveReview,
  onRefresh,
}: {
  shipment: ShipmentDetailDto;
  canSubmitReview: boolean;
  canApproveReview: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const itemName = (review: DiscrepancyReviewDto, shipmentItemId: string) =>
    shipment.items.find((it) => it.id === shipmentItemId)?.name ?? shipmentItemId;

  const handleApprove = async (reviewId: string) => {
    setBusy(reviewId);
    setError(null);
    try {
      await approveReview(reviewId);
      onRefresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    setBusy(rejectingId);
    setError(null);
    try {
      await rejectReview(rejectingId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason('');
      onRefresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(null);
    }
  };

  const pending = shipment.reviews.find((r) => r.status === 'PENDING');

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">{t('reviews.title')}</h2>
      {error && rejectingId === null && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {pending && canSubmitReview && (
        <p className="text-sm text-warning-700">{t('reviews.waitingApproval')}</p>
      )}
      {shipment.reviews.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('reviews.none')}</p>
      ) : (
        shipment.reviews.map((review) => (
          <Card key={review.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    review.status === 'APPROVED'
                      ? 'success'
                      : review.status === 'REJECTED'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {t(`reviews.statuses.${review.status}`)}
                </Badge>
                <span className="text-xs text-ink-subtle">
                  {review.createdAt ? formatDateTime(review.createdAt, locale) : '—'}
                </span>
              </div>
              {review.status === 'PENDING' && canApproveReview && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={busy === review.id}
                    disabled={busy !== null}
                    onClick={() => void handleApprove(review.id)}
                  >
                    {t('reviews.approve')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => setRejectingId(review.id)}
                  >
                    {t('reviews.reject')}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {review.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-1 rounded-lg border border-line p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 font-medium text-ink">
                      {itemName(review, item.shipmentItemId)}
                    </span>
                    <span className="shrink-0 text-sm text-ink-muted">
                      {item.expectedQtyBefore} → {item.actualQty}
                    </span>
                  </div>
                  {item.reason && <p className="text-xs text-ink-muted">{item.reason}</p>}
                </div>
              ))}
            </div>

            {review.reason && <p className="text-xs text-ink-muted">{review.reason}</p>}
            {review.photoFileIds.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {review.photoFileIds.map((fileId) => (
                  <FileImage key={fileId} fileId={fileId} className="h-20 w-20 rounded object-cover" alt={fileId} />
                ))}
              </div>
            )}
          </Card>
        ))
      )}

      <Dialog
        open={rejectingId !== null}
        onOpenChange={(next) => setRejectingId(next ? rejectingId : null)}
        closeLabel={t('common.close')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reviews.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Textarea
              placeholder={t('reviews.rejectReasonPlaceholder')}
              aria-label={t('reviews.rejectReasonPlaceholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            {error && (
              <p role="alert" className="mt-3 text-sm text-danger-600">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              data-autofocus
              disabled={busy !== null}
              onClick={() => setRejectingId(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={busy !== null && rejectingId !== null}
              disabled={busy !== null || rejectReason.trim() === ''}
              onClick={() => void handleReject()}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
