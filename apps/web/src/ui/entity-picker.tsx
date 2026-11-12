import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../lib/cn';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Empty } from './empty';
import { Input } from './input';
import { Skeleton } from './skeleton';
import { Spinner } from './spinner';

// ---------------------------------------------------------------------------
// EntityPicker：从大量记录里挑一条。
//
// 为什么不做成下拉框：物品动辄几千条，原生 <select> 只能靠首字母跳转，自绘下拉
// 在表单弹窗里既会被裁切、又只能展示「已经加载的那 50 条」——用户真实感受就是
// 「看不全数据」。这里改成「模态选择器 + 服务端搜索 + 虚拟滚动」：
//   - 搜索在服务端做（q 参数），永远能搜到全库，不是只筛当前页；
//   - 列表虚拟化，滚到底自动续页，总数一直显示；
//   - 多列信息（名称 / 编码 / 库存）一次看全，不用点开才知道是哪一个。
// ---------------------------------------------------------------------------

export interface PickerOption {
  id: string;
  label: string;
  /** 右侧次要信息：SKU、库存、单位等。 */
  meta?: string;
  disabled?: boolean;
}

export interface PickerColumn {
  label: string;
  render: (option: PickerOption) => React.ReactNode;
  width?: string;
}

export interface EntityPickerProps {
  id?: string;
  value: string;
  /** 触发器上展示的文本（编辑态回填时由调用方提供）。 */
  displayValue?: string;
  title: string;
  placeholder?: string;
  searchPlaceholder?: string;
  onSearch: (query: string, page: number) => Promise<{ items: PickerOption[]; total: number }>;
  onChange: (option: PickerOption) => void;
  columns?: PickerColumn[];
  disabled?: boolean;
  required?: boolean;
  /** 触发器自身的可访问名。筛选栏里的「全部物品」按钮单靠文本说不清筛的是什么。 */
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  className?: string;
}

const PAGE_SIZE = 50;

export function EntityPicker({
  id,
  value,
  displayValue,
  title,
  placeholder,
  searchPlaceholder,
  onSearch,
  onChange,
  columns,
  disabled,
  required,
  className,
  ...aria
}: EntityPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PickerOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 250);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchPage = async (nextQuery: string, nextPage: number, append: boolean) => {
    const token = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await onSearch(nextQuery, nextPage);
      // 只接受最后一次请求的结果：慢网络下先发的请求可能后到，会把新结果覆盖掉
      if (token !== requestId.current) return;
      setItems((prev) => (append ? [...prev, ...result.items] : result.items));
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      if (token !== requestId.current) return;
      setError(t('common.picker.loadFailed'));
    } finally {
      if (token === requestId.current) setLoading(false);
    }
  };

  // 打开时加载第一页；搜索词变化时重新从第一页加载
  useEffect(() => {
    if (!open) return;
    void fetchPage(debouncedQuery, 1, false);
    setActiveIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedQuery]);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVisible = virtualItems[virtualItems.length - 1];

  // 滚到底部自动续页
  useEffect(() => {
    if (!lastVisible) return;
    if (lastVisible.index < items.length - 1) return;
    if (loading) return;
    if (items.length >= total) return;
    void fetchPage(debouncedQuery, page + 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastVisible?.index, items.length, total, loading]);

  // 焦点一打开就落在搜索框：用户打开选择器就是要搜索
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const move = (delta: number) => {
    if (items.length === 0) return;
    setActiveIndex((prev) => {
      const next = prev < 0 ? (delta > 0 ? 0 : items.length - 1) : prev + delta;
      const clamped = Math.max(0, Math.min(items.length - 1, next));
      rowVirtualizer.scrollToIndex(clamped, { align: 'auto' });
      return clamped;
    });
  };

  const commit = (option: PickerOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option);
    setOpen(false);
    setQuery('');
  };

  const active = activeIndex >= 0 ? items[activeIndex] : undefined;

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={aria['aria-label']}
        aria-required={required || undefined}
        aria-describedby={aria['aria-describedby']}
        aria-invalid={aria['aria-invalid']}
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-8 w-full min-w-0 items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 text-start text-[13px]',
          'hover:border-line-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
          className,
        )}
      >
        <span className={cn('truncate', !displayValue && 'text-ink-subtle')}>{displayValue || placeholder || t('common.picker.placeholder')}</span>
        <Search aria-hidden className="size-3.5 shrink-0 text-ink-subtle" />
      </button>

      <Dialog open={open} onOpenChange={setOpen} closeLabel={t('common.close')}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-2">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                ref={inputRef}
                data-autofocus
                role="combobox"
                aria-expanded={open}
                aria-controls="entity-picker-list"
                aria-activedescendant={active ? `entity-picker-option-${active.id}` : undefined}
                aria-autocomplete="list"
                value={query}
                placeholder={searchPlaceholder ?? t('common.picker.searchPlaceholder')}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // 中文输入法回车是「确认候选词」，不是「选中当前项」
                  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    move(1);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    move(-1);
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    commit(active);
                  }
                }}
                className="ps-8"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('common.picker.clearSearch')}
                  className="absolute end-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] text-ink-subtle hover:bg-surface-muted hover:text-ink"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span role="status">
                {loading && items.length === 0
                  ? t('common.loading')
                  : t('common.picker.count', { count: total.toLocaleString('zh-CN'), total })}
              </span>
              <span className="text-ink-subtle">{t('common.picker.hint')}</span>
            </div>

            {columns && columns.length > 0 ? (
              <div
                className="grid gap-2 border-b border-line pb-1 text-[11px] font-semibold text-ink-muted"
                style={{ gridTemplateColumns: `minmax(0,1fr) ${columns.map((c) => c.width ?? '6rem').join(' ')}` }}
                aria-hidden
              >
                <span>{t('common.picker.name')}</span>
                {columns.map((column) => (
                  <span key={column.label} className="truncate">
                    {column.label}
                  </span>
                ))}
              </div>
            ) : null}

            <div
              ref={scrollRef}
              id="entity-picker-list"
              role="listbox"
              aria-label={title}
              className="app-scroll h-72 overflow-auto rounded-[var(--radius-control)] border border-line"
            >
              {error ? <Empty title={error} className="py-10" /> : null}
              {!error && loading && items.length === 0 ? (
                <div className="flex flex-col gap-2 p-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-7 w-full" />
                  ))}
                </div>
              ) : null}
              {!error && !loading && items.length === 0 ? (
                <Empty title={t('common.picker.empty')} description={t('common.picker.emptyHint')} className="py-10" />
              ) : null}

              {items.length > 0 ? (
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                  {virtualItems.map((virtualRow) => {
                    const option = items[virtualRow.index]!;
                    const isActive = virtualRow.index === activeIndex;
                    const isSelected = option.id === value;
                    return (
                      <div
                        key={option.id}
                        id={`entity-picker-option-${option.id}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        data-active={isActive || undefined}
                        className={cn(
                          'absolute inset-x-0 flex cursor-pointer items-center gap-2 border-b border-line/60 px-2 text-[13px]',
                          isActive ? 'bg-brand-50 text-ink' : 'text-ink-soft hover:bg-surface-muted',
                          option.disabled && 'cursor-not-allowed opacity-50',
                        )}
                        style={{ height: 44, transform: `translateY(${virtualRow.start}px)` }}
                        onMouseEnter={() => setActiveIndex(virtualRow.index)}
                        // 用 mousedown 而不是 click：click 之前输入框会先 blur，某些浏览器会在
                        // blur 时把列表收起，导致点不中
                        onMouseDown={(event) => {
                          event.preventDefault();
                          commit(option);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="block truncate font-medium">{option.label}</span>
                          {option.meta ? <span className="block truncate text-[11px] text-ink-subtle">{option.meta}</span> : null}
                        </span>
                        {columns?.map((column) => (
                          <span key={column.label} className="w-24 truncate text-end text-[12px] text-ink-muted" style={{ width: column.width }}>
                            {column.render(option)}
                          </span>
                        ))}
                        {isSelected ? <Check aria-hidden className="size-4 shrink-0 text-brand-600" /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {loading && items.length > 0 ? (
                <div className="flex items-center justify-center gap-2 py-2 text-xs text-ink-muted">
                  <Spinner className="size-3" /> {t('common.picker.loadingMore')}
                </div>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13px] text-ink-soft hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!active}
              onClick={() => commit(active)}
              className="inline-flex h-8 items-center rounded-[var(--radius-control)] bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
            >
              {t('common.picker.select')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
