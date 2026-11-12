import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 页面标题区：统一 h1 排版与操作区在窄屏下的换行行为。

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {/* text-balance：标题折行时按行宽均衡分配，避免最后一行只剩一两个字
            （modern-web-guidance: typography）。只用于标题，不要挂在通配符上。 */}
        <h1 className="text-balance text-[17px] font-semibold tracking-tight text-ink sm:text-lg">
          {title}
        </h1>
        {description ? <p className="text-xs text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
