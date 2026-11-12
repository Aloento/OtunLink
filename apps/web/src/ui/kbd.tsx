import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/** 快捷键提示。用原生 <kbd>，读屏会念成「按键」。 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line bg-surface-muted px-1',
        'font-sans text-[11px] font-medium text-ink-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
