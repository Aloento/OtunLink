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
        // 下划线式页签（ERP 惯例）：内容区紧贴页签，视觉噪音比药丸式分段控件低
        'inline-flex w-full items-center gap-4 border-b border-line sm:w-auto',
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
        'relative -mb-px inline-flex min-h-9 flex-1 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 text-[13px] font-medium text-ink-muted transition-colors sm:flex-none',
        'hover:border-line-strong hover:text-ink',
        // 选中态用 2px 实线（brand-600 对白底 6.7:1），不靠底色区分：颜色之外还有形状线索
        'data-[state=active]:border-brand-600 data-[state=active]:text-brand-700',
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
