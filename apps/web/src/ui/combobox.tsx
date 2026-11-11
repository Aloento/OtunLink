import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';

import { cn } from '../lib/cn';
import { inputClass } from './input';

// 可搜索下拉选择器（ARIA 1.2 combobox 模式）：
// - 输入框带 role="combobox" + aria-expanded + aria-controls + aria-activedescendant
// - 列表由 Popover 定位（视口边缘自动翻转），避免被裁剪
// - 上下键移动、Enter 选中、Esc 关闭、Tab 直接离开
// 选项数量多时由调用方决定是否走服务端过滤。

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Combobox({
  value,
  onValueChange,
  options,
  onSelect,
  placeholder,
  loading = false,
  loadingText,
  emptyText,
  className,
  id,
  disabled,
  required,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** 输入框中的文本。 */
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  onSelect: (option: ComboboxOption) => void;
  placeholder?: string;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  /** 由 <Field> 注入：本控件的宿主是内部 <input>，这些属性必须落到它身上。 */
  required?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}) {
  const [open, setOpen] = useState(false);
  // -1 表示「还没有高亮任何项」：否则第一次按 ArrowDown 会跳过第一项。
  const [activeIndex, setActiveIndex] = useState(-1);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const enabledOptions = useMemo(() => options.filter((o) => !o.disabled), [options]);
  const active = enabledOptions[activeIndex];

  const select = (option: ComboboxOption) => {
    onSelect(option);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 组字期间（中文/日文/韩文输入法）方向键与回车属于输入法自身，不要抢。
    if (event.nativeEvent.isComposing) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(enabledOptions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open && active) {
      // IME 组字期间的 Enter 是「确认候选词」，不是「选中这项」。
      // Safari 会在 compositionend 之后才派发 keydown，isComposing 已复位，
      // 因此同时判断 keyCode === 229（VK_PROCESSKEY）。
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      select(active);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className={cn('relative', className)}>
          <input
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && active ? `${listboxId}-${active.value}` : undefined}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            required={required}
            className={cn(inputClass, 'min-h-10 pe-9')}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => {
              onValueChange(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
          />
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 max-h-64 w-(--radix-popover-trigger-width) overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {loading ? (
            <p className="px-3 py-2 text-sm text-ink-subtle">{loadingText}</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-subtle">{emptyText}</p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label={ariaLabel} className="flex flex-col">
              {options.map((option) => {
                const isActive = active?.value === option.value;
                return (
                  <li
                    key={option.value}
                    id={`${listboxId}-${option.value}`}
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={option.disabled || undefined}
                    onPointerEnter={() => {
                      const index = enabledOptions.findIndex((o) => o.value === option.value);
                      if (index >= 0) setActiveIndex(index);
                    }}
                    onClick={() => {
                      if (!option.disabled) select(option);
                    }}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm',
                      option.disabled
                        ? 'cursor-not-allowed text-ink-subtle'
                        : isActive
                          ? // 当前项靠 aria-activedescendant 虚拟聚焦：底色只比白底亮 1.09:1，
                            // 必须再加一条 brand-600 的描边（6.7:1），键盘用户才看得见焦点在哪
                            'bg-brand-50 text-brand-700 outline-2 -outline-offset-2 outline-brand-600'
                          : 'text-ink-soft',
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{option.label}</span>
                      {option.description ? (
                        <span className="truncate text-xs text-ink-subtle">{option.description}</span>
                      ) : null}
                    </span>
                    {isActive ? <Check aria-hidden className="size-4 shrink-0" /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
