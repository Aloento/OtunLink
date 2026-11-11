import { useQuery } from '@tanstack/react-query';

import { getFileUrl } from '../api/items';

// 通过预签名 URL 渲染一个文件（缩略图优先）。URL 缓存 10 分钟（签名 15 分钟有效）。
// 缩略图列表通常一次出现很多张：懒加载 + 异步解码，避免首屏被图片解码阻塞。
export function FileImage({
  fileId,
  alt,
  className,
}: {
  fileId: string;
  alt?: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ['files', fileId, 'url'],
    queryFn: () => getFileUrl(fileId),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const src = data?.thumbnailUrl ?? data?.url;
  if (!src) return null;
  return (
    <img src={src} alt={alt ?? ''} className={className} loading="lazy" decoding="async" />
  );
}
