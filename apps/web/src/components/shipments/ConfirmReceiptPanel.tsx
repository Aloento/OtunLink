import {
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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FileDto, ShipmentDetailDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { confirmReceipt } from '../../api/shipments';
import { ImageUpload } from '../ImageUpload';

// 确认收货面板（ck-07 §6.1）：READY 发货单 → 确认收货（备注/照片/逐行批次号），
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
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" weight="semibold" size={400}>
          {t('shipments.confirmReceipt.title')}
        </Text>
        <Button appearance="primary" onClick={() => setOpen(true)}>
          {t('shipments.confirmReceipt.action')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(_e, data) => setOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('shipments.confirmReceipt.title')}</DialogTitle>
            <DialogContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  {shipment.items.map((item) => (
                    <div key={item.id} className="flex flex-col gap-1 rounded border border-neutral-200 p-3">
                      <div className="font-medium">{item.name}</div>
                      <Text size={200} className="text-neutral-500">
                        {t('shipments.expectedQty')}: {item.expectedQty}
                        {item.expiryDate ? ` · ${t('shipments.expiryDate')}: ${item.expiryDate}` : ''}
                      </Text>
                      <Input
                        placeholder={t('shipments.confirmReceipt.batchNoPlaceholder')}
                        value={batchNos[item.id] ?? ''}
                        onChange={(_e, data) =>
                          setBatchNos((prev) => ({ ...prev, [item.id]: data.value }))
                        }
                        className="max-w-sm"
                      />
                    </div>
                  ))}
                </div>
                <Textarea
                  placeholder={t('shipments.confirmReceipt.remarkPlaceholder')}
                  value={remark}
                  onChange={(_e, data) => setRemark(data.value)}
                  resize="vertical"
                />
                <div className="flex flex-col gap-1">
                  <Text size={300}>{t('shipments.confirmReceipt.photos')}</Text>
                  <ImageUpload value={photos} onChange={setPhotos} />
                </div>
              </div>
            </DialogContent>
            {error && <Text className="px-1 text-red-600">{error}</Text>}
            <DialogActions>
              <Button appearance="secondary" disabled={submitting} onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button appearance="primary" disabled={submitting} onClick={() => void handleSubmit()}>
                {submitting ? <Spinner size="tiny" /> : t('shipments.confirmReceipt.action')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
