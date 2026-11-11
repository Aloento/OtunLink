import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

// 下拉菜单（Radix）：键盘导航、typeahead、焦点归还都由 primitive 负责。

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-lg',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm text-ink-soft',
        // 去掉原生焦点环后必须给出 **>=3:1** 的替代高亮：surface-muted / brand-50 与白底只有
        // ~1.1:1，brand-200 的描边也只有 1.33:1，都不足以指示「键盘焦点在这一项」。
        // 用 brand-600 实边框（对白底 6.71:1）：边框在强制配色模式下依然保留，
        // 不像 box-shadow 那样会被抹掉（modern-web-guidance: color / accessibility）。
        'outline-none',
        'data-[highlighted]:border-brand-600 data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-700',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-3 py-1.5 text-xs font-medium text-ink-subtle', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('my-1 h-px bg-line', className)}
      {...props}
    />
  );
}
