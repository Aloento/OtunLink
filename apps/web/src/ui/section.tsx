import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 表单/详情页的分区：一行标题 + 说明 + 右侧动作 + 内容。
// 用 <section aria-labelledby> 而不是只画一条线：读屏可以按区跳读。
export function Section({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1.5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[13px] font-semibold text-ink">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}
