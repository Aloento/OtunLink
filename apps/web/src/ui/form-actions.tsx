import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 表单底部的操作条。
//
// 单据表单会长到两三屏（十几行明细），把「保存/取消」放在文档流末尾意味着
// 每改一行都要滚到底才能提交。这里把它吸在视口底部：
// - 移动端底部导航是 fixed 的，所以小屏要抬高一个导航高度，否则按钮会被挡住；
// - 背景用 surface + 顶部细线，滚动内容从它下面穿过时不会和按钮文字重叠。
export function FormActions({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  /** 按钮下方的一句说明（例如「保存后仍可编辑」）。 */
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky z-10 -mx-3 border-t border-line bg-surface/95 px-3 py-2 backdrop-blur-sm md:-mx-4 md:px-4',
        // 让小屏的同学在底部导航之上：3.75rem = 底部导航 44px + 内边距 + 分隔线
        'bottom-[calc(3.75rem+env(safe-area-inset-bottom))] md:bottom-0',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">{children}</div>
      {hint ? <p className="mt-1 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
