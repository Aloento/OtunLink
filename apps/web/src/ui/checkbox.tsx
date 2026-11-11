import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { forwardRef } from 'react';

import { cn } from '../lib/cn';

// 原生复选框 + 自绘勾选标记（appearance: none + ::before/::after 的思路，
// 这里用 peer + span 实现，保持 input 本身可聚焦、可被 AT 识别）。

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, id, ...props },
  ref,
) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft',
        props.disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className={cn(
            'peer size-5 cursor-pointer appearance-none rounded border border-line-strong bg-surface transition-colors',
            'checked:border-brand-600 checked:bg-brand-600',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
            'disabled:cursor-not-allowed',
          )}
          {...props}
        />
        <Check
          aria-hidden
          strokeWidth={3}
          // 勾选时的缩放是空间动效：要求减少动效时直接切到终态，不做过渡。
          className="pointer-events-none absolute size-3.5 scale-75 text-white opacity-0 transition peer-checked:scale-100 peer-checked:opacity-100 motion-reduce:transition-none"
        />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
});
