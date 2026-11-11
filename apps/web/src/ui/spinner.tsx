import { LoaderCircle } from 'lucide-react';

import { cn } from '../lib/cn';

/** 内联加载指示器。`label` 作为可访问名称（视觉上也显示在 spinner 右侧）。 */
export function Spinner({
  className,
  label,
  size = 'md',
}: {
  className?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dimension = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-5';
  return (
    <span className={cn('inline-flex items-center gap-2 text-ink-subtle', className)} role="status">
      <LoaderCircle aria-hidden className={cn(dimension, 'animate-spin')} />
      {/* 可见文案本身就是 role="status" 区域的可访问名称；
          再叠一份 sr-only 同名文本会让屏幕阅读器把「加载中」读两遍。 */}
      {label ? <span className="text-sm">{label}</span> : null}
    </span>
  );
}
