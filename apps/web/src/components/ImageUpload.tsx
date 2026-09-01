import { Button, Spinner, Text } from '@fluentui/react-components';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { FileDto } from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../api/http';
import { uploadItemImage } from '../api/items';
import { compressImageFile, makeThumbnailBlob } from '../lib/image-compress';
import { FileImage } from './FileImage';

// 图片上传：浏览器 Canvas 压缩（最长边 1600px / ≤2MB）+ 320px 缩略图，
// 随后 multipart 上传 POST /files，返回的文件 DTO 由父级持有（新建随物品提交 / 编辑时补挂）。
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
          setError(
            isApiError(cause) ? t(errorI18nKey(cause.code)) : t('items.upload.failed'),
          );
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
        {value.map((file) => (
          <div key={file.id} className="group relative">
            <FileImage fileId={file.id} className="h-20 w-20 rounded object-cover" alt={file.id} />
            <button
              type="button"
              aria-label={t('items.upload.remove')}
              title={t('items.upload.remove')}
              onClick={() => remove(file.id)}
              className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-xs text-white group-hover:flex"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          appearance="secondary"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === 'compressing'
            ? t('items.upload.compressing')
            : busy === 'uploading'
              ? t('items.upload.uploading')
              : t('items.upload.add')}
        </Button>
        {busy !== null && <Spinner size="tiny" />}
      </div>

      <Text size={100} className="text-neutral-500">
        {t('items.upload.hint')}
      </Text>
      {error && <Text className="text-red-600">{error}</Text>}
    </div>
  );
}
