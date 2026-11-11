import { useQuery } from '@tanstack/react-query';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getFileUrl } from '../api/items';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

// 图片预览：缩略图点击 → 模态查看，可切换 1:1 缩放。
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
        className="m-0 cursor-zoom-in rounded border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onClick={() => setOpen(true)}
        aria-label={t('items.imagePreview.open')}
      >
        <img src={thumbnail} alt={alt ?? ''} className={className} loading="lazy" decoding="async" />
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())} closeLabel={t('common.close')}>
        <DialogContent className="max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>{t('items.imagePreview.title')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex max-h-[75vh] items-center justify-center overflow-auto p-0">
            <button
              type="button"
              className="m-0 cursor-zoom-in border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              onClick={() => setZoomed((value) => !value)}
              aria-label={t(zoomed ? 'items.imagePreview.zoomOut' : 'items.imagePreview.zoomIn')}
            >
              <img
                src={fullImage}
                alt={alt ?? ''}
                className={zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-[75vh] max-w-full object-contain'}
              />
            </button>
          </DialogBody>
          <DialogFooter className="justify-between">
            <Button
              variant="subtle"
              icon={zoomed ? <ZoomOut aria-hidden className="size-4" /> : <ZoomIn aria-hidden className="size-4" />}
              onClick={() => setZoomed((value) => !value)}
            >
              {t(zoomed ? 'items.imagePreview.zoomOut' : 'items.imagePreview.zoomIn')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
