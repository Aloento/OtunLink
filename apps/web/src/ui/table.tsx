import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

// 语义化表格：<caption> 供屏幕阅读器，表头在纵向滚动时保持可见
// （border-collapse: separate 才能让 sticky 表头的边框跟着走）。

export function TableRegion({
  className,
  label,
  children,
}: {
  className?: string;
  /** 可滚动区域的名称（屏幕阅读器读出的「区域」名）。 */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn('max-w-full overflow-x-auto rounded-card border border-line bg-surface', className)}
    >
      {children}
    </div>
  );
}

export function Table({ className, children, ...props }: ComponentProps<'table'>) {
  return (
    <table className={cn('w-full border-collapse text-sm', className)} {...props}>
      {children}
    </table>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('sticky top-0 z-[1] bg-surface-muted text-start', className)}
      {...props}
    />
  );
}

export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-t border-line', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2 align-top text-ink-soft', className)} {...props} />;
}
