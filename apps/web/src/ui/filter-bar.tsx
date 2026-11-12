import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/cn';

// 列表页工具条：搜索 + 筛选 + 结果计数 + 右侧动作。
// 所有列表页共用同一条横向基线，用户的视线不用在每页重新找「刷新按钮在哪」。

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  extra,
  right,
  resultText,
  className,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** 下拉筛选、日期区间等，直接排在选择器右侧。 */
  extra?: ReactNode;
  /** 右侧动作：刷新、密度、新建。 */
  right?: ReactNode;
  resultText?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-wrap items-center gap-2 px-3 py-2', className)}>
      {onSearchChange ? (
        <div className="relative w-full max-w-72">
          <Search aria-hidden className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            role="searchbox"
            value={searchValue ?? ''}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className={cn(
              'h-8 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pe-7 ps-8 text-[13px] text-ink',
              'placeholder:text-ink-subtle hover:border-line-hover',
              'focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
              // 原生 search 的清除按钮样式各浏览器不一，统一交给右侧自绘按钮
              '[&::-webkit-search-cancel-button]:appearance-none',
            )}
          />
          {searchValue ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label={t('common.picker.clearSearch')}
              className="absolute end-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {extra}

      <div className="flex-1" />

      {resultText ? <div className="text-xs text-ink-muted">{resultText}</div> : null}
      {right ? <div className="flex items-center gap-1.5">{right}</div> : null}
    </div>
  );
}
