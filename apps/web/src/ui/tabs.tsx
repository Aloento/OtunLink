import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

// 分段选项卡：Radix Tabs 负责 role="tab"/"tabpanel"、roving tabindex 与
// 方向键/Home/End 导航。
//
// 每个 TabsTrigger 都应有对应的 TabsContent（Radix 会把 aria-controls 指过去）；
// 内容需要共用同一段渲染逻辑时，用同一个渲染函数分别放进各 TabsContent。

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex w-full items-center gap-1 rounded-lg bg-surface-muted p-1 sm:w-auto',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // min-h + 内边距而不是固定高度：系统字号放大时标签页要能跟着长高（WCAG 1.4.12）。
        'inline-flex min-h-8 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1 text-sm font-medium text-ink-muted transition-colors sm:flex-none',
        'hover:text-ink',
        // 选中态：白底与列表的 surface-muted 只差 1.09:1，单靠底色无法识别选中项（WCAG 1.4.11）。
        // 用 line-strong 的实边框（白底 3.36:1）补一条非颜色之外也成立的边界线索。
        'data-[state=active]:border-line-strong data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('flex flex-col gap-4', className)}
      {...props}
    />
  );
}
