import { Button, Body1, Spinner, Text, Textarea, Title1 } from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Permissions, hasPermission, type ReturnOrderItemDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { acceptReturn, getReturn, rejectReturn } from '../../api/returns';
import { useSession } from '../../auth/SessionProvider';
import { ResponsiveTable, type ResponsiveTableColumn } from '../../components/ResponsiveTable';

// 退货单详情（ck-07 §6.1）：集货方（或管理员）对 PENDING 退货单同意/拒绝。
export function ReturnDetailPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const queryClient = useQueryClient();

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['return-orders', id],
    queryFn: () => getReturn(id),
    staleTime: 15_000,
  });

  const canHandle =
    hasPermission(me?.role, Permissions.SHIPMENT_RETURNS_HANDLE) &&
    (!me?.scopeUnitId || me.scopeUnitId === data?.toUnitId);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['return-orders', id] });

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptReturn(id, note.trim() || null);
      setNote('');
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!note.trim()) {
      setError(t('returns.rejectNotePlaceholder'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectReturn(id, note.trim());
      setNote('');
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Text className="text-red-600">{t('errors.NOT_FOUND')}</Text>
        <Link to="/returns">
          <Button appearance="secondary">{t('returns.back')}</Button>
        </Link>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('returns.returnNo'), data.returnNo],
    [t('returns.shipmentNo'), data.shipmentNo ?? '—'],
    [
      t('returns.route'),
      `${data.fromUnitName ?? data.fromUnitId} → ${data.toUnitName ?? data.toUnitId}`,
    ],
    [t('returns.status'), t(`returns.statuses.${data.status}`)],
    [t('returns.createdAt'), data.createdAt],
    [t('returns.processedAt'), data.processedAt ?? '—'],
  ];

  const columns: ResponsiveTableColumn<ReturnOrderItemDto>[] = [
    { key: 'name', header: t('returns.itemName'), render: (item) => item.itemName ?? item.itemId },
    { key: 'qty', header: t('returns.qty'), render: (item) => item.qty },
    { key: 'reason', header: t('returns.lineReason'), render: (item) => item.reason ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">
          {t('returns.detail')} · {data.returnNo}
        </Title1>
        <Link to="/returns">
          <Button appearance="secondary">{t('returns.back')}</Button>
        </Link>
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

      {data.reason && <Body1>{data.reason}</Body1>}

      <div className="flex flex-col gap-2">
        <Text as="h2" weight="semibold" size={400}>
          {t('returns.items')}
        </Text>
        <ResponsiveTable
          columns={columns}
          items={data.items}
          rowKey={(item) => item.id}
          emptyText={t('returns.noItems')}
        />
      </div>

      {data.status === 'PENDING' && canHandle && (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
          <Textarea
            placeholder={
              note.trim()
                ? undefined
                : t('returns.acceptNotePlaceholder')
            }
            value={note}
            onChange={(_e, d) => setNote(d.value)}
            resize="vertical"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button appearance="primary" disabled={busy} onClick={() => void handleAccept()}>
              {busy ? <Spinner size="tiny" /> : t('returns.accept')}
            </Button>
            <Button appearance="secondary" disabled={busy} onClick={() => void handleReject()}>
              {t('returns.reject')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
