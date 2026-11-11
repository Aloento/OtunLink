import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Permissions, SHIPMENT_STATUSES, hasPermission, type ShipmentDto, type ShipmentStatus } from '@otunlink/shared';

import { listShipments } from '../../api/shipments';
import { useSession } from '../../auth/SessionProvider';
import { RefreshButton } from '../../components/RefreshButton';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';
import { Button } from '../../ui/button';
import { PageHeader } from '../../ui/page-header';
import { Pagination } from '../../ui/pagination';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';

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
        <Link to={`/shipments/${shipment.id}`} className="font-medium text-brand-700 hover:underline">
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
      render: (shipment) => <span className="tabular-nums">{shipment.boxesCount}</span>,
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
      <PageHeader
        title={t('shipments.title')}
        actions={
          <>
            <RefreshButton queryKey={['shipments', 'list']} />
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as ShipmentStatus | '');
                setPage(1);
              }}
              className="w-full sm:w-40"
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
              <Button asChild variant="primary">
                <Link to="/shipments/new">{t('shipments.newShipment')}</Link>
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : isError ? (
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.UNKNOWN')}
        </p>
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            items={data?.items ?? []}
            rowKey={(shipment) => shipment.id}
            emptyText={t('shipments.empty')}
            label={t('shipments.title')}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            totalLabel={t('shipments.total', { total })}
          />
        </>
      )}
    </div>
  );
}
