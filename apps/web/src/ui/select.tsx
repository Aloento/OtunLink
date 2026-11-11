import type { ComponentProps } from 'react';
import type { ReactNode } from 'react';
import { forwardRef } from 'react';

import { cn } from '../lib/cn';

// 原生 <select>。
//
// 用原生控件而不是自建 listbox：键盘、输入法、屏幕阅读器和移动端系统选择器
// 全部由浏览器提供。`appearance: base-select`（见 index.css 的 .app-select）
// 在支持的浏览器里给出可完全改色的下拉面板，不支持的浏览器退回系统下拉。

export type SelectOption = { value: string; label: string; disabled?: boolean };

export interface SelectProps extends Omit<ComponentProps<'select'>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  /** 便捷写法：直接给选项数组；也可改成 <option> 子节点。 */
  options?: SelectOption[];
  placeholder?: string;
  className?: string;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { value, onValueChange, options, placeholder, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(
        'app-select min-h-10 w-full min-w-0 rounded-lg border border-line-strong bg-surface py-2 ps-3 text-sm text-ink',
        'hover:border-line-hover',
        'focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
        'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
        className,
      )}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options
        ? options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))
        : children}
    </select>
  );
});
