import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Text,
  Textarea,
} from '@fluentui/react-components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DiscrepancyReviewDto, ShipmentDetailDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { approveReview, rejectReview } from '../../api/shipments';
import { FileImage } from '../FileImage';

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
      <Text as="h2" weight="semibold" size={400}>
        {t('reviews.title')}
      </Text>
      {error && <Text className="text-red-600">{error}</Text>}
      {pending && canSubmitReview && (
        <Text className="text-amber-700">{t('reviews.waitingApproval')}</Text>
      )}
      {shipment.reviews.length === 0 ? (
        <Text className="text-neutral-500">{t('reviews.none')}</Text>
      ) : (
        shipment.reviews.map((review) => (
          <div key={review.id} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  appearance="tint"
                  color={review.status === 'APPROVED' ? 'success' : review.status === 'REJECTED' ? 'danger' : 'warning'}
                >
                  {t(`reviews.statuses.${review.status}`)}
                </Badge>
                <Text size={200} className="text-neutral-500">
                  {review.createdAt}
                </Text>
              </div>
              {review.status === 'PENDING' && canApproveReview && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    appearance="primary"
                    size="small"
                    disabled={busy !== null}
                    onClick={() => void handleApprove(review.id)}
                  >
                    {busy === review.id ? <Spinner size="tiny" /> : t('reviews.approve')}
                  </Button>
                  <Button
                    appearance="secondary"
                    size="small"
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
                <div key={item.id} className="flex flex-col gap-1 rounded border border-neutral-100 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{itemName(review, item.shipmentItemId)}</span>
                    <span className="text-sm text-neutral-600">
                      {item.expectedQtyBefore} → {item.actualQty}
                    </span>
                  </div>
                  {item.reason && <Text size={200} className="text-neutral-500">{item.reason}</Text>}
                </div>
              ))}
            </div>

            {review.reason && (
              <Text size={200} className="text-neutral-600">
                {review.reason}
              </Text>
            )}
            {review.photoFileIds.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {review.photoFileIds.map((fileId) => (
                  <FileImage key={fileId} fileId={fileId} className="h-20 w-20 rounded object-cover" alt={fileId} />
                ))}
              </div>
            )}
          </div>
        ))
      )}

      <Dialog open={rejectingId !== null} onOpenChange={(_e, data) => setRejectingId(data.open ? rejectingId : null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('reviews.rejectTitle')}</DialogTitle>
            <DialogContent>
              <Textarea
                placeholder={t('reviews.rejectReasonPlaceholder')}
                value={rejectReason}
                onChange={(_e, data) => setRejectReason(data.value)}
                resize="vertical"
              />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" disabled={busy !== null} onClick={() => setRejectingId(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                appearance="primary"
                disabled={busy !== null || rejectReason.trim() === ''}
                onClick={() => void handleReject()}
              >
                {busy !== null && rejectingId ? <Spinner size="tiny" /> : t('common.confirm')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
