import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 卡片/分区容器：统一的边框、圆角、内边距与标题排版。

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-4', className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
