import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { decodeFrameNative, decodeFrameZxing, supportsNativeBarcodeDetector } from '../lib/barcode';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';

// 相机扫码对话框：
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
  const formId = useId();

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitManual();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} closeLabel={t('common.close')}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('items.scanDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="relative h-56 w-full overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} muted playsInline className="size-full object-cover" />
            {scanning ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <Spinner label={t('items.scanDialog.scanning')} className="text-white" />
              </div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger-600">
              {error}
            </p>
          ) : null}
          {/* 用原生 <form> 承担 Enter 提交：浏览器在 IME 组字期间会抑制隐式提交，
              因此不需要手写 keydown 判断（见 modern-web-guidance: ime-safe-enter-submit）。 */}
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label={t('items.scanDialog.manualHint')}>
              <Input
                value={manual}
                placeholder={t('items.scanDialog.manualPlaceholder')}
                onChange={(event) => setManual(event.target.value)}
              />
            </Field>
            <button type="submit" className="sr-only">
              {t('items.scanDialog.confirm')}
            </button>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('items.scanDialog.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={manual.trim().length === 0}
          >
            {t('items.scanDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
