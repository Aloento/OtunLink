import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Permissions, hasPermission } from '@otunlink/shared';

import { deleteItem, getItem } from '../../api/items';
import { isApiError } from '../../api/http';
import { refreshAfterWrite } from '../../api/queryClient';
import { useSession } from '../../auth/SessionProvider';
import { ImagePreview } from '../../components/ImagePreview';
import { RefreshButton } from '../../components/RefreshButton';
import { Button } from '../../ui/button';
import { Facts } from '../../ui/facts';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { PageHeader } from '../../ui/page-header';
import { Spinner } from '../../ui/spinner';

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
  const [error, setError] = useState<string | null>(null);
  // 删除是不可撤销操作：用 <ConfirmDialog tone="danger"> 把初始焦点放在「取消」上。
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['items', id],
    queryFn: () => getItem(id),
  });

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteItem(id);
      void refreshAfterWrite(queryClient);
      navigate('/items');
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('errors.UNKNOWN'));
      setDeleting(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger-600">
          {t('errors.NOT_FOUND')}
        </p>
        <Button asChild variant="secondary">
          <Link to="/items">{t('items.back')}</Link>
        </Button>
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
    [t('items.minSaleUnit'), t(`items.minSaleUnits.${data.minSaleUnit}`)],
    [
      t('items.status'),
      data.status === 'ACTIVE' ? t('items.statusActive') : t('items.statusInactive'),
    ],
    [t('items.isPerishable'), data.isPerishable ? t('common.yes') : t('common.no')],
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${t('items.detail')} · ${data.name}`}
        actions={
          <>
            <RefreshButton queryKey={['items', id]} />
            <Button asChild variant="secondary">
              <Link to="/items">{t('items.back')}</Link>
            </Button>
            {canWrite && (
              <Button asChild variant="primary">
                <Link to={`/items/${id}/edit`}>{t('items.edit')}</Link>
              </Button>
            )}
            {canWrite && (
              <Button
                variant="secondary"
                loading={deleting}
                onClick={() => setConfirmDelete(true)}
              >
                {t('items.delete')}
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      <Facts items={rows} boxed />

      {data.description && <p className="text-sm text-ink-soft">{data.description}</p>}

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{t('items.images')}</h2>
        {data.images.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t('items.noImages')}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {data.images.map((image) => (
              <ImagePreview
                key={image.id}
                fileId={image.fileId}
                className="h-32 w-32 rounded-lg border border-line object-cover"
                alt={data.name}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('items.deleteConfirm', { name: data.name })}
        confirmLabel={t('common.confirm')}
        tone="danger"
        busy={deleting}
        onConfirm={() => {
          setConfirmDelete(false);
          void handleDelete();
        }}
      />
    </div>
  );
}
