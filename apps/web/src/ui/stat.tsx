import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 工作台指标卡：数字是主角，标签次要，趋势/单位放在第三行。
// 数字用 tabular-nums，同一行的卡片不会因为位数不同而左右跳动。
export function StatCard({
  label,
  value,
  meta,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'brand' | 'warning' | 'danger' | 'success';
  onClick?: () => void;
}) {
  const toneClass = {
    neutral: 'text-ink',
    brand: 'text-brand-700',
    warning: 'text-warning-700',
    danger: 'text-danger-600',
    success: 'text-success-600',
  }[tone];

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5 text-start',
        onClick &&
          'transition-colors hover:border-line-strong hover:bg-surface-muted/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
        {icon ? <span className="text-ink-subtle [&_svg]:size-3.5">{icon}</span> : null}
        {label}
      </span>
      <span className={cn('text-[22px] font-semibold leading-tight tabular-nums', toneClass)}>{value}</span>
      {meta ? <span className="truncate text-[11px] text-ink-subtle">{meta}</span> : null}
    </Comp>
  );
}
