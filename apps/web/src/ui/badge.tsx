import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 状态徽标：用色块 + 文本表达状态，不单靠颜色（a11y：颜色不是唯一信息载体）。

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-ink-muted ring-line',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-success-50 text-success-600 ring-success-200',
  warning: 'bg-warning-50 text-warning-700 ring-warning-200',
  danger: 'bg-danger-50 text-danger-600 ring-danger-200',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] px-1.5 py-px text-[11px] font-medium leading-4 ring-1 ring-inset whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
