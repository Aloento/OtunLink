import { Button, Select, Spinner, Text, Title1 } from '@fluentui/react-components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Permissions, SHIPMENT_STATUSES, hasPermission, type ShipmentDto, type ShipmentStatus } from '@otunlink/shared';

import { useSession } from '../../auth/SessionProvider';
import { listShipments } from '../../api/shipments';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

const PAGE_SIZE = 20;

// 发货单列表：状态过滤 + 分页 + 物流单号卡片。
export function ShipmentsPage() {
  const { t } = useTranslation();
  const { me } = useSession();

  const [status, setStatus] = useState<ShipmentStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shipments', 'list', status || undefined, page],
    queryFn: () =>
      listShipments({ status: status || undefined, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const canCreate = hasPermission(me?.role, Permissions.SHIPMENTS_CREATE);

  const columns: ResponsiveTableColumn<ShipmentDto>[] = [
    {
      key: 'shipmentNo',
      header: t('shipments.shipmentNo'),
      render: (shipment) => (
        <Link to={`/shipments/${shipment.id}`} className="font-medium text-blue-600 hover:underline">
          {shipment.shipmentNo}
        </Link>
      ),
    },
    {
      key: 'route',
      header: t('shipments.route'),
      render: (shipment) =>
        `${shipment.shipperName ?? shipment.shipperUnitId} → ${shipment.receiverName ?? shipment.receiverUnitId}`,
    },
    {
      key: 'status',
      header: t('shipments.status'),
      render: (shipment) => t(`shipments.statuses.${shipment.status}`),
    },
    {
      key: 'boxes',
      header: t('shipments.boxes'),
      render: (shipment) => String(shipment.boxesCount),
    },
    {
      key: 'trackings',
      header: t('shipments.trackings'),
      render: (shipment) =>
        shipment.trackings.length === 0
          ? '—'
          : shipment.trackings.map((tr) => `${tr.carrier} ${tr.trackingNo}`).join(' / '),
    },
    {
      key: 'sentAt',
      header: t('shipments.sentAt'),
      render: (shipment) => shipment.sentAt ?? '—',
    },
  ];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">{t('shipments.title')}</Title1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKey={['shipments', 'list']} />
          <Select
            value={status}
            onChange={(_, d) => {
              setStatus(d.value as ShipmentStatus | '');
              setPage(1);
            }}
            className="min-w-40"
            aria-label={t('shipments.status')}
          >
            <option value="">{t('shipments.allStatuses')}</option>
            {SHIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`shipments.statuses.${s}`)}
              </option>
            ))}
          </Select>
          {canCreate && (
            <Link to="/shipments/new">
              <Button appearance="primary">{t('shipments.newShipment')}</Button>
            </Link>
          )}
        </div>
      </div>

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <Text className="text-red-600">{t('errors.UNKNOWN')}</Text>
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            items={data?.items ?? []}
            rowKey={(shipment) => shipment.id}
            emptyText={t('shipments.empty')}
          />
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{t('shipments.total', { total })}</span>
            <div className="flex items-center gap-2">
              <Button
                size="small"
                appearance="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                size="small"
                appearance="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
