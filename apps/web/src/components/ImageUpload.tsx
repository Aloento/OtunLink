import { X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FileDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../api/http';
import { uploadItemImage } from '../api/items';
import { compressImageFile, makeThumbnailBlob } from '../lib/image-compress';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { FileImage } from './FileImage';

// 图片上传：浏览器 Canvas 压缩（最长边 1600px / ≤2MB）+ 320px 缩略图，
// 随后 multipart 上传 POST /files，返回的文件 DTO 由父级持有并在提交时关联。
type BusyState = 'compressing' | 'uploading' | null;

export function ImageUpload({
  value,
  onChange,
}: {
  value: FileDto[];
  onChange: (files: FileDto[]) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      setError(null);
      const appended: FileDto[] = [];
      for (const file of Array.from(list)) {
        try {
          setBusy('compressing');
          const image = await compressImageFile(file);
          let thumb: Blob | undefined;
          try {
            thumb = await makeThumbnailBlob(file);
          } catch {
            thumb = undefined;
          }
          setBusy('uploading');
          const dto = await uploadItemImage(
            thumb ? { image: image.blob, thumb } : { image: image.blob },
          );
          appended.push(dto);
        } catch (cause) {
          setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('items.upload.failed'));
          break;
        }
      }
      setBusy(null);
      if (appended.length > 0) onChange([...value, ...appended]);
      if (inputRef.current) inputRef.current.value = '';
    },
    [value, onChange, t],
  );

  const remove = (id: string) => onChange(value.filter((f) => f.id !== id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {value.map((file, index) => (
          <div key={file.id} className="group relative">
            {/* 缩略图本身是装饰性的（文件 id 对用户无意义），序号信息交给删除按钮的可访问名称。 */}
            <FileImage fileId={file.id} className="size-20 rounded object-cover" alt="" />
            <button
              type="button"
              aria-label={`${t('items.upload.remove')} ${index + 1}`}
              title={t('items.upload.remove')}
              onClick={() => remove(file.id)}
              // 用 opacity 而不是 display 隐藏：`hidden` 会让按钮退出 Tab 顺序，
              // 键盘用户根本没有办法删掉已上传的图片（WCAG 2.1.1）。
              // size-6 = 24×24，满足 2.5.8 的最小点击目标；触摸设备没有 hover，始终显示。
              className="absolute -end-2 -top-2 flex size-6 items-center justify-center rounded-full bg-ink-soft text-white opacity-0 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === 'compressing'
            ? t('items.upload.compressing')
            : busy === 'uploading'
              ? t('items.upload.uploading')
              : t('items.upload.add')}
        </Button>
        {busy !== null ? <Spinner size="sm" /> : null}
      </div>

      <p className="text-xs text-ink-subtle">{t('items.upload.hint')}</p>
      {error ? (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
