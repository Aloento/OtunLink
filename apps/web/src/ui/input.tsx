import type { ComponentProps } from 'react';
import { forwardRef } from 'react';

import { cn } from '../lib/cn';

// 原生 <input>：全部样式走 Tailwind，行为/可访问性由浏览器提供
// （autofill、输入法、密码管理等都不需要额外实现）。

export const inputClass =
  'block w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1 text-[13px] text-ink ' +
  'placeholder:text-ink-subtle ' +
  'hover:border-line-hover ' +
  'focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle ' +
  'aria-invalid:border-danger-600';

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(inputClass, 'min-h-8', className)} {...props} />;
});
