import { Badge, Button, Body1, Spinner, Text, Title1 } from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type InboundOrderItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { getInbound, postInbound } from '../../api/inbound';
import { useSession } from '../../auth/SessionProvider';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

// 入库单详情：批次清单 + 草稿过账（建档批次 / 写库存台账）。
export function InboundDetailPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const queryClient = useQueryClient();

  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbound-orders', id],
    queryFn: () => getInbound(id),
    staleTime: 15_000,
  });

  const canPost = hasPermission(me?.role, Permissions.INBOUND_CONFIRM);

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      await postInbound(id);
      await queryClient.invalidateQueries({ queryKey: ['inbound-orders', id] });
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setPosting(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Text className="text-red-600">{t('errors.NOT_FOUND')}</Text>
        <Link to="/inbound">
          <Button appearance="secondary">{t('inbound.back')}</Button>
        </Link>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('inbound.inboundNo'), data.inboundNo],
    [t('inbound.sourceType'), t(`inbound.sourceTypes.${data.sourceType}`)],
    [t('inbound.shipmentNo'), data.shipmentNo ?? '—'],
    [t('inbound.warehouse'), data.warehouseName ?? data.warehouseUnitId],
    [t('inbound.counterparty'), data.counterpartyName ?? data.counterpartyUnitId ?? '—'],
    [t('inbound.status'), t(`inbound.statuses.${data.status}`)],
    [t('inbound.createdAt'), data.createdAt],
    [t('inbound.postedAt'), data.postedAt ?? '—'],
  ];

  const columns: ResponsiveTableColumn<InboundOrderItemDto>[] = [
    { key: 'name', header: t('inbound.itemName'), render: (item) => item.itemName ?? item.itemId },
    {
      key: 'batchNo',
      header: t('inbound.batchNo'),
      render: (item) => item.batchNo ?? <Text className="text-neutral-400">—</Text>,
    },
    {
      key: 'batchId',
      header: t('inbound.batchId'),
      render: (item) =>
        item.batchId ? (
          <Badge appearance="tint" color="success">
            ✓
          </Badge>
        ) : (
          <Text className="text-neutral-400">—</Text>
        ),
    },
    { key: 'qty', header: t('inbound.qty'), render: (item) => item.qty },
    { key: 'unitCost', header: t('inbound.unitCost'), render: (item) => item.unitCost },
    {
      key: 'productionDate',
      header: t('inbound.productionDate'),
      render: (item) => item.productionDate ?? '—',
    },
    { key: 'expiryDate', header: t('inbound.expiryDate'), render: (item) => item.expiryDate ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">
          {t('inbound.detail')} · {data.inboundNo}
        </Title1>
        <div className="flex items-center gap-2">
          <Link to="/inbound">
            <Button appearance="secondary">{t('inbound.back')}</Button>
          </Link>
          {data.status === 'DRAFT' && canPost && (
            <Button appearance="primary" disabled={posting} onClick={() => void handlePost()}>
              {posting ? <Spinner size="tiny" /> : t('inbound.post')}
            </Button>
          )}
        </div>
      </div>

      {error && <Text className="text-red-600">{error}</Text>}

      {data.status === 'DRAFT' && canPost && (
        <Text size={200} className="text-amber-700">
          {t('inbound.postConfirm')}
        </Text>
      )}

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
          {t('inbound.items')}
        </Text>
        <ResponsiveTable
          columns={columns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('inbound.noItems')}
        />
      </div>
    </div>
  );
}
