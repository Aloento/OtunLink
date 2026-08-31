import { Body1, Button, Spinner, Text, Title1 } from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type ShipmentItemDto } from '@otunlink/shared';

import { useSession } from '../../auth/SessionProvider';
import { errorI18nKey, isApiError } from '../../api/http';
import { getShipment, sendShipment } from '../../api/shipments';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

// 发货单详情（ck-05 §6.1）：字段 + 物流单号 + 清单（效期列）+ 转交/编辑按钮。
export function ShipmentDetailPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const queryClient = useQueryClient();

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shipments', id],
    queryFn: () => getShipment(id),
    staleTime: 15_000,
  });

  const canEdit = hasPermission(me?.role, Permissions.SHIPMENTS_CREATE);
  const canSend = hasPermission(me?.role, Permissions.SHIPMENTS_TRANSFER);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      await sendShipment(id);
      await queryClient.invalidateQueries({ queryKey: ['shipments'] });
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setSending(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Text className="text-red-600">{t('errors.NOT_FOUND')}</Text>
        <Link to="/shipments">
          <Button appearance="secondary">{t('shipments.back')}</Button>
        </Link>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('shipments.shipmentNo'), data.shipmentNo],
    [
      t('shipments.route'),
      `${data.shipperName ?? data.shipperUnitId} → ${data.receiverName ?? data.receiverUnitId}`,
    ],
    [t('shipments.status'), t(`shipments.statuses.${data.status}`)],
    [t('shipments.boxes'), String(data.boxesCount)],
    [t('shipments.currency'), data.currency],
    [t('shipments.expectedArrivalDate'), data.expectedArrivalDate ?? '—'],
    [t('shipments.sentAt'), data.sentAt ?? '—'],
    [t('shipments.createdAt'), data.createdAt],
  ];

  const itemColumns: ResponsiveTableColumn<ShipmentItemDto>[] = [
    { key: 'name', header: t('shipments.itemName'), render: (item) => item.name },
    { key: 'spec', header: t('shipments.itemSpec'), render: (item) => item.spec ?? '—' },
    { key: 'qty', header: t('shipments.expectedQty'), render: (item) => item.expectedQty },
    { key: 'price', header: t('shipments.unitPrice'), render: (item) => item.unitPrice ?? '—' },
    {
      key: 'productionDate',
      header: t('shipments.productionDate'),
      render: (item) => item.productionDate ?? '—',
    },
    { key: 'expiryDate', header: t('shipments.expiryDate'), render: (item) => item.expiryDate ?? '—' },
    { key: 'note', header: t('shipments.lineNote'), render: (item) => item.lineNote ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">
          {t('shipments.detail')} · {data.shipmentNo}
        </Title1>
        <div className="flex items-center gap-2">
          <Link to="/shipments">
            <Button appearance="secondary">{t('shipments.back')}</Button>
          </Link>
          {data.status === 'DRAFT' && canEdit && (
            <Link to={`/shipments/${id}/edit`}>
              <Button appearance="primary">{t('shipments.edit')}</Button>
            </Link>
          )}
          {data.status === 'DRAFT' && canSend && (
            <Button appearance="primary" disabled={sending} onClick={() => void handleSend()}>
              {t('shipments.send')}
            </Button>
          )}
        </div>
      </div>

      {error && <Text className="text-red-600">{error}</Text>}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between border-b border-neutral-200 py-1">
            <dt className="text-sm text-neutral-500">{label}</dt>
            <dd className="text-sm font-medium text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>

      {data.remark && <Body1>{data.remark}</Body1>}

      <div className="flex flex-col gap-2">
        <Text as="h2" weight="semibold" size={400}>
          {t('shipments.trackings')}
        </Text>
        {data.trackings.length === 0 ? (
          <Text className="text-neutral-500">{t('shipments.noTrackings')}</Text>
        ) : (
          <div className="flex flex-wrap gap-3">
            {data.trackings.map((tr) => (
              <div key={tr.id} className="rounded border border-neutral-200 p-3">
                <div className="font-medium">
                  {tr.carrier} · {tr.trackingNo}
                </div>
                {tr.note && <div className="text-sm text-neutral-500">{tr.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Text as="h2" weight="semibold" size={400}>
          {t('shipments.items')}
        </Text>
        <ResponsiveTable
          columns={itemColumns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('shipments.noItems')}
        />
      </div>
    </div>
  );
}
