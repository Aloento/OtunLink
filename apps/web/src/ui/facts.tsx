import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

// 详情页的「标签 → 值」清单。
//
// 为什么不用「标签：值」连排：ERP 详情页一屏有十几项，连排会把标签和值混成一段话，
// 眼睛找不到某一项的边界。这里每项一行、行间一条细线、值右对齐并加粗 —— 扫读时
// 竖着看值那一列即可，和表格的数字列是同一种阅读节奏。
//
// 语义仍然是 <dl>：dt/dd 天然成对，读屏会念「标签, 值」，不需要额外的 aria。
export function Facts({
  items,
  columns = 2,
  boxed = false,
  className,
}: {
  /** [标签, 值] 元组：与各详情页已有的 rows 数组形状一致，调用方不用改写。 */
  items: Array<[ReactNode, ReactNode]>;
  /** ≥640px 时的列数。1 列适合长文本，2 列适合常规字段。 */
  columns?: 1 | 2;
  /** 是否需要自带卡片外观（已经包在 <Card> 里的调用方传 false）。 */
  boxed?: boolean;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-8 gap-y-0',
        columns === 2 && 'sm:grid-cols-2',
        boxed && 'rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2',
        className,
      )}
    >
      {items.map(([label, value], index) => (
        <div
          key={index}
          className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-b-0"
        >
          <dt className="shrink-0 text-[13px] text-ink-muted">{label}</dt>
          <dd className="min-w-0 text-end text-[13px] font-medium wrap-break-word text-ink tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
