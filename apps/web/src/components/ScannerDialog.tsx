import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Spinner,
  Text,
} from '@fluentui/react-components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { decodeFrameNative, decodeFrameZxing, supportsNativeBarcodeDetector } from '../lib/barcode';

// 相机扫码对话框（ck-04 §8.7）：
// - 原生 BarcodeDetector（https/本地）优先，否则回退 @zxing/browser；
// - 关闭/成功时 stop 所有 media track 释放相机；
// - 始终提供手动输入条码作为兜底路径。
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function ScannerDialog({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let stream: MediaStream | null = null;
    setError(null);
    setScanning(true);

    const loop = async (decode: (video: HTMLVideoElement) => Promise<string | null>) => {
      const video = videoRef.current;
      if (!video) return;
      while (!disposed) {
        const code = await decode(video);
        if (code) {
          onScanRef.current(code);
          return;
        }
        await sleep(120);
      }
    };

    const start = async () => {
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        setError(t('items.scanDialog.notSupported'));
        setScanning(false);
        return;
      }
      try {
        stream = await mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (supportsNativeBarcodeDetector()) {
          await loop(decodeFrameNative);
        } else {
          await loop(decodeFrameZxing);
        }
      } catch {
        if (!disposed) setError(t('items.scanDialog.noCamera'));
      } finally {
        setScanning(false);
      }
    };

    void start();

    return () => {
      disposed = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, t]);

  const submitManual = () => {
    const code = manual.trim();
    if (!code) return;
    onScan(code);
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t('items.scanDialog.title')}</DialogTitle>
          <DialogContent className="flex flex-col gap-3">
            <div className="relative h-56 w-full overflow-hidden rounded bg-black">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              {scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Spinner label={t('items.scanDialog.scanning')} />
                </div>
              )}
            </div>
            {error && <Text className="text-red-600">{error}</Text>}
            <Field label={t('items.scanDialog.manualHint')}>
              <Input
                value={manual}
                placeholder={t('items.scanDialog.manualPlaceholder')}
                onChange={(_, data) => setManual(data.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t('items.scanDialog.cancel')}
            </Button>
            <Button appearance="primary" onClick={submitManual} disabled={manual.trim().length === 0}>
              {t('items.scanDialog.confirm')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
