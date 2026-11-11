import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FileDto, ShipmentDetailDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { confirmReceipt } from '../../api/shipments';
import { ImageUpload } from '../ImageUpload';
import { Button } from '../../ui/button';
import { Card, CardHeader } from '../../ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

// 确认收货面板：READY 发货单 → 确认收货（备注/照片/逐行批次号），
// 服务端自动建档 DRAFT 入库单并置发货单为 INBOUNDED。
export function ConfirmReceiptPanel({
  shipment,
  canConfirm,
  onRefresh,
}: {
  shipment: ShipmentDetailDto;
  canConfirm: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remark, setRemark] = useState('');
  const [photos, setPhotos] = useState<FileDto[]>([]);
  const [batchNos, setBatchNos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await confirmReceipt(shipment.id, {
        remark: remark.trim() || null,
        photoFileIds: photos.map((f) => f.id),
        items: shipment.items.map((item) => ({
          shipmentItemId: item.id,
          batchNo: (batchNos[item.id] ?? '').trim() || null,
        })),
      });
      setOpen(false);
      setRemark('');
      setPhotos([]);
      setBatchNos({});
      onRefresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setSubmitting(false);
    }
  };

  if (shipment.status !== 'READY' || !canConfirm) return null;

  return (
    <Card>
      <CardHeader
        title={t('shipments.confirmReceipt.title')}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            {t('shipments.confirmReceipt.action')}
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen} closeLabel={t('common.close')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('shipments.confirmReceipt.title')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {shipment.items.map((item, index) => (
                  <div key={item.id} className="flex flex-col gap-1 rounded-lg border border-line p-3">
                    <div className="font-medium text-ink">{item.name}</div>
                    <p className="text-xs text-ink-muted">
                      {t('shipments.expectedQty')}: {item.expectedQty}
                      {item.expiryDate ? ` · ${t('shipments.expiryDate')}: ${item.expiryDate}` : ''}
                    </p>
                    <Input
                      aria-label={`${t('shipments.confirmReceipt.batchNoPlaceholder')} ${item.name}`}
                      placeholder={t('shipments.confirmReceipt.batchNoPlaceholder')}
                      value={batchNos[item.id] ?? ''}
                      data-autofocus={index === 0 ? true : undefined}
                      onChange={(e) =>
                        setBatchNos((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      className="max-w-sm"
                    />
                  </div>
                ))}
              </div>
              <Textarea
                aria-label={t('shipments.confirmReceipt.remarkPlaceholder')}
                placeholder={t('shipments.confirmReceipt.remarkPlaceholder')}
                value={remark}
                data-autofocus={shipment.items.length === 0 ? true : undefined}
                onChange={(e) => setRemark(e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <p className="text-sm text-ink-soft">{t('shipments.confirmReceipt.photos')}</p>
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
            <Button variant="secondary" disabled={submitting} onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void handleSubmit()}>
              {t('shipments.confirmReceipt.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
