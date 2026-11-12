import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 空状态：图标 + 一句话 + 可选动作。列表页的「没有数据」和「筛选后没有结果」
// 是两种不同处境，文案必须由调用方区分，这里只负责排版。
export function Empty({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {icon ? <div className="text-ink-subtle [&_svg]:size-6">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="max-w-sm text-xs text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
