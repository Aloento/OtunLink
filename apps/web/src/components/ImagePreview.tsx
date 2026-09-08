import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getFileUrl } from '../api/items';

export function ImagePreview({
  fileId,
  alt,
  className,
}: {
  fileId: string;
  alt?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const { data } = useQuery({
    queryKey: ['files', fileId, 'url'],
    queryFn: () => getFileUrl(fileId),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const thumbnail = data?.thumbnailUrl ?? data?.url;
  const fullImage = data?.url;
  if (!thumbnail || !fullImage) return null;

  const close = () => {
    setOpen(false);
    setZoomed(false);
  };

  return (
    <>
      <button
        type="button"
        className="cursor-zoom-in rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        onClick={() => setOpen(true)}
        aria-label={t('items.imagePreview.open')}
      >
        <img src={thumbnail} alt={alt ?? ''} className={className} />
      </button>
      <Dialog open={open} onOpenChange={(_, state) => !state.open && close()}>
        <DialogSurface className="max-w-[calc(100vw-2rem)]">
          <DialogBody>
            <DialogTitle>{t('items.imagePreview.title')}</DialogTitle>
            <DialogContent className="flex max-h-[80vh] max-w-[90vw] items-center justify-center overflow-auto p-0">
              <button
                type="button"
                className="cursor-zoom-in"
                onClick={() => setZoomed((value) => !value)}
                aria-label={t(zoomed ? 'items.imagePreview.zoomOut' : 'items.imagePreview.zoomIn')}
              >
                <img
                  src={fullImage}
                  alt={alt ?? ''}
                  className={zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-[75vh] max-w-full object-contain'}
                />
              </button>
            </DialogContent>
            <div className="flex justify-between gap-2 pt-3">
              <Button appearance="subtle" onClick={() => setZoomed((value) => !value)}>
                {t(zoomed ? 'items.imagePreview.zoomOut' : 'items.imagePreview.zoomIn')}
              </Button>
              <Button appearance="secondary" onClick={close}>
                {t('common.close')}
              </Button>
            </div>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
