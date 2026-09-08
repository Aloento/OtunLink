import {
  Body1,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  Input,
  DialogTitle,
  Select,
  Spinner,
  Text,
  Title1,
} from '@fluentui/react-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Permissions, hasPermission } from '@otunlink/shared';

import { deleteItem, getItem, listItems, mergeItem } from '../../api/items';
import { isApiError } from '../../api/http';
import { useSession } from '../../auth/SessionProvider';
import { ImagePreview } from '../../components/ImagePreview';
import { RefreshButton } from '../../components/RefreshButton';

// 物品详情：字段 + 图片（预签名 URL 展示）。
export function ItemDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useSession();
  const canWrite = hasPermission(me?.role, Permissions.ITEMS_WRITE);

  const [deleting, setDeleting] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeId, setMergeId] = useState('');
  const [mergeQuery, setMergeQuery] = useState('');
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items', id],
    queryFn: () => getItem(id),
    staleTime: 30_000,
  });
  const mergeCandidates = useQuery({
    queryKey: ['items', 'merge-candidates', mergeQuery],
    queryFn: () => listItems({ q: mergeQuery || undefined, size: 50 }),
    enabled: mergeOpen,
  });

  const handleDelete = async () => {
    if (!window.confirm(t('items.deleteConfirm', { name: data?.name ?? '' }))) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteItem(id);
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      navigate('/items');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
      setDeleting(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeId) return;
    if (!window.confirm(t('items.mergeConfirm'))) return;
    setMerging(true);
    setError(null);
    try {
      await mergeItem(id, mergeId);
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      setMergeOpen(false);
      setMergeId('');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
    } finally {
      setMerging(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Text className="text-red-600">{t('errors.NOT_FOUND')}</Text>
        <Link to="/items">
          <Button appearance="secondary">{t('items.back')}</Button>
        </Link>
      </div>
    );
  }

  const rows: Array<[string, string]> = [
    [t('items.sku'), data.sku ?? '—'],
    [t('items.barcode'), data.barcode ?? '—'],
    [t('items.category'), data.category ?? '—'],
    [t('items.specUnit'), t(`items.specUnits.${data.specUnit}`)],
    [t('items.innerUnit'), data.innerUnit ? t(`items.innerUnits.${data.innerUnit}`) : '—'],
    [t('items.innerCount'), data.innerCount ?? '—'],
    [
      t('items.status'),
      data.status === 'ACTIVE' ? t('items.statusActive') : t('items.statusInactive'),
    ],
    [t('items.isPerishable'), data.isPerishable ? t('common.yes') : t('common.no')],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title1 as="h1">
          {t('items.detail')} · {data.name}
        </Title1>
        <div className="flex items-center gap-2">
          <RefreshButton queryKey={['items', id]} />
          <Link to="/items">
            <Button appearance="secondary">{t('items.back')}</Button>
          </Link>
          {canWrite && (
            <Link to={`/items/${id}/edit`}>
              <Button appearance="primary">{t('items.edit')}</Button>
            </Link>
          )}
          {canWrite && (
            <Button appearance="secondary" disabled={deleting} onClick={() => void handleDelete()}>
              {deleting ? <Spinner size="tiny" /> : t('items.delete')}
            </Button>
          )}
          {canWrite && (
            <Button appearance="secondary" onClick={() => setMergeOpen(true)}>
              {t('items.merge')}
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

      {data.description && <Body1>{data.description}</Body1>}

      <div className="flex flex-col gap-2">
        <Text as="h2" weight="semibold" size={400}>
          {t('items.images')}
        </Text>
        {data.images.length === 0 ? (
          <Text className="text-neutral-500">{t('items.noImages')}</Text>
        ) : (
          <div className="flex flex-wrap gap-3">
            {data.images.map((image) => (
              <ImagePreview
                key={image.id}
                fileId={image.fileId}
                className="h-32 w-32 rounded object-cover"
                alt={data.name}
              />
            ))}
          </div>
        )}
      </div>
      <Dialog open={mergeOpen} onOpenChange={(_, state) => !state.open && setMergeOpen(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('items.mergeTitle')}</DialogTitle>
            <DialogContent className="flex flex-col gap-3">
              <Text>{t('items.mergeHint', { name: data.name })}</Text>
              <Input
                value={mergeQuery}
                onChange={(_, option) => setMergeQuery(option.value)}
                placeholder={t('items.mergeSearch')}
                aria-label={t('items.mergeSearch')}
              />
              <Select
                value={mergeId}
                onChange={(_, option) => setMergeId(option.value)}
                aria-label={t('items.mergeSource')}
              >
                <option value="">{t('items.mergeSelect')}</option>
                {(mergeCandidates.data?.items ?? [])
                  .filter((item) => item.id !== id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.sku ?? item.id}
                    </option>
                  ))}
              </Select>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setMergeOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button appearance="primary" disabled={!mergeId || merging} onClick={() => void handleMerge()}>
                {merging ? <Spinner size="tiny" /> : t('items.merge')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
