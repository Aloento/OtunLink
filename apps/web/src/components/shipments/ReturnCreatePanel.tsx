import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ShipmentDetailDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { createReturn } from '../../api/shipments';
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
    <Card>
      <CardHeader
        title={t('shipments.returnCreate.title')}
        actions={
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t('shipments.returnCreate.action')}
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen} closeLabel={t('common.close')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('shipments.returnCreate.title')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {shipment.items.map((item, index) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 font-medium text-ink">{item.name}</div>
                      <p className="shrink-0 text-xs text-ink-muted">
                        {t('shipments.expectedQty')}: {item.expectedQty}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      placeholder={t('shipments.returnCreate.qty')}
                      value={qtys[item.id] ?? ''}
                      data-autofocus={index === 0 ? true : undefined}
                      onChange={(e) => setQtys((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="max-w-40"
                      aria-label={`${t('shipments.returnCreate.qty')} ${item.name}`}
                    />
                    <Textarea
                      placeholder={t('shipments.returnCreate.lineReasonPlaceholder')}
                      aria-label={`${t('shipments.returnCreate.lineReasonPlaceholder')} ${item.name}`}
                      value={lineReasons[item.id] ?? ''}
                      onChange={(e) =>
                        setLineReasons((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <Textarea
                placeholder={t('shipments.returnCreate.reasonPlaceholder')}
                aria-label={t('shipments.returnCreate.reasonPlaceholder')}
                value={reason}
                data-autofocus={shipment.items.length === 0 ? true : undefined}
                onChange={(e) => setReason(e.target.value)}
              />
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
              {t('shipments.returnCreate.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
