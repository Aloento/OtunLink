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

import type { ShipmentDetailDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { createReturn } from '../../api/shipments';

// 发货退货（拒收）面板：READY 发货单 → 仓库发起部分/全部拒收，
// 生成 PENDING 退货单并置发货单为 RETURN_PENDING。
export function ReturnCreatePanel({
  shipment,
  canCreate,
  onRefresh,
}: {
  shipment: ShipmentDetailDto;
  canCreate: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [lineReasons, setLineReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const filledLines = shipment.items
    .map((item) => ({ item, value: (qtys[item.id] ?? '').trim() }))
    .filter(({ value }) => value !== '');

  const handleSubmit = async () => {
    if (filledLines.length === 0) {
      setError(t('shipments.returnCreate.needAtLeastOne'));
      return;
    }
    for (const { item, value } of filledLines) {
      if (Number(value) > Number(item.expectedQty)) {
        setError(t('shipments.returnCreate.qtyExceeded'));
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      await createReturn(shipment.id, {
        reason: reason.trim() || null,
        items: filledLines.map(({ item, value }) => ({
          shipmentItemId: item.id,
          qty: value,
          reason: (lineReasons[item.id] ?? '').trim() || null,
        })),
      });
      setOpen(false);
      setReason('');
      setQtys({});
      setLineReasons({});
      onRefresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setSubmitting(false);
    }
  };

  if (shipment.status !== 'READY' || !canCreate) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" weight="semibold" size={400}>
          {t('shipments.returnCreate.title')}
        </Text>
        <Button appearance="secondary" onClick={() => setOpen(true)}>
          {t('shipments.returnCreate.action')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(_e, data) => setOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('shipments.returnCreate.title')}</DialogTitle>
            <DialogContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  {shipment.items.map((item) => (
                    <div key={item.id} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-medium">{item.name}</div>
                        <Text size={200} className="text-neutral-500">
                          {t('shipments.expectedQty')}: {item.expectedQty}
                        </Text>
                      </div>
                      <Input
                        appearance="underline"
                        type="number"
                        min={0}
                        step={1}
                        placeholder={t('shipments.returnCreate.qty')}
                        value={qtys[item.id] ?? ''}
                        onChange={(_e, data) =>
                          setQtys((prev) => ({ ...prev, [item.id]: data.value }))
                        }
                        className="max-w-40"
                        aria-label={`${t('shipments.returnCreate.qty')} ${item.name}`}
                      />
                      <Textarea
                        placeholder={t('shipments.returnCreate.lineReasonPlaceholder')}
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
                  placeholder={t('shipments.returnCreate.reasonPlaceholder')}
                  value={reason}
                  onChange={(_e, data) => setReason(data.value)}
                  resize="vertical"
                />
              </div>
            </DialogContent>
            {error && <Text className="px-1 text-red-600">{error}</Text>}
            <DialogActions>
              <Button appearance="secondary" disabled={submitting} onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button appearance="primary" disabled={submitting} onClick={() => void handleSubmit()}>
                {submitting ? <Spinner size="tiny" /> : t('shipments.returnCreate.action')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
