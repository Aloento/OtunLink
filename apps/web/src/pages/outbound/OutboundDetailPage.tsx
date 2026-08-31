import { Badge, Button, Body1, Spinner, Text, Title1 } from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type OutboundOrderItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { getOutboundOrder, postOutboundOrder } from '../../api/outbound';
import { useSession } from '../../auth/SessionProvider';
import { FileImage } from '../../components/FileImage';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

// 出库单详情（ck-08a §4.3）：批次分配结果 + 草稿过账（扣减库存 / 写台账流水）。
export function OutboundDetailPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const queryClient = useQueryClient();

  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['outbound-orders', id],
    queryFn: () => getOutboundOrder(id),
    staleTime: 15_000,
  });

  const canPost = hasPermission(me?.role, Permissions.STOCK_WRITE);

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      await postOutboundOrder(id);
      await queryClient.invalidateQueries({ queryKey: ['outbound-orders', id] });
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
        <Link to="/outbound">
          <Button appearance="secondary">{t('outbound.back')}</Button>
        </Link>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('outbound.outboundNo'), data.outboundNo],
    [t('outbound.type'), t(`outbound.types.${data.type}`)],
    [t('outbound.warehouse'), data.warehouseName ?? data.warehouseUnitId],
    [t('outbound.counterparty'), data.counterpartyName ?? data.counterpartyUnitId ?? '—'],
    [t('outbound.status'), t(`outbound.statuses.${data.status}`)],
    [t('outbound.createdAt'), data.createdAt],
    [t('outbound.postedAt'), data.postedAt ?? '—'],
  ];
  if (data.type === 'LOSS') {
    rows.splice(4, 0, [t('outbound.lossReason'), data.lossReason ?? '—']);
  }

  const columns: ResponsiveTableColumn<OutboundOrderItemDto>[] = [
    { key: 'itemName', header: t('outbound.itemName'), render: (item) => item.itemName ?? item.itemId },
    {
      key: 'batchNo',
      header: t('outbound.batchNo'),
      render: (item) =>
        item.batchNo ?? (
          <Badge appearance="tint" color="brand">
            {t('outbound.fefo')}
          </Badge>
        ),
    },
    { key: 'qty', header: t('outbound.qty'), render: (item) => item.qty },
    { key: 'unitCost', header: t('outbound.unitCost'), render: (item) => item.unitCost ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">
          {t('outbound.detail')} · {data.outboundNo}
        </Title1>
        <div className="flex items-center gap-2">
          <Link to="/outbound">
            <Button appearance="secondary">{t('outbound.back')}</Button>
          </Link>
          {data.status === 'DRAFT' && canPost && (
            <Button appearance="primary" disabled={posting} onClick={() => void handlePost()}>
              {posting ? <Spinner size="tiny" /> : t('outbound.post')}
            </Button>
          )}
        </div>
      </div>

      {error && <Text className="text-red-600">{error}</Text>}

      {data.status === 'DRAFT' && canPost && (
        <Text size={200} className="text-amber-700">
          {t('outbound.postConfirm')}
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

      {data.type === 'LOSS' && data.photoFileIds.length > 0 && (
        <div className="flex flex-col gap-2">
          <Text as="h2" weight="semibold" size={400}>
            {t('outbound.lossPhotos')}
          </Text>
          <div className="flex flex-wrap gap-3">
            {data.photoFileIds.map((fileId) => (
              <FileImage key={fileId} fileId={fileId} className="h-24 w-24 rounded object-cover" alt={fileId} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Text as="h2" weight="semibold" size={400}>
          {t('outbound.items')}
        </Text>
        <ResponsiveTable
          columns={columns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('outbound.noItems')}
        />
      </div>
    </div>
  );
}
