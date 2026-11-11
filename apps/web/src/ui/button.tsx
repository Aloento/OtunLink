import * as Slot from '@radix-ui/react-slot';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { forwardRef } from 'react';

import { cn } from '../lib/cn';

// 按钮：三种优先级 + 危险操作 + 图标按钮。
// 加载态用 aria-busy 表达，不改变按钮尺寸（避免布局跳动 / CLS）。

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'subtle'
  | 'danger'
  | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'icon';

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ' +
  'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary:
    'border border-line-strong bg-surface text-ink-soft hover:bg-surface-muted active:bg-surface-hover',
  subtle: 'bg-surface-muted text-ink-soft hover:bg-surface-hover',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
};

// 文字按钮用 min-height + 内边距，而不是固定高度：用户放大系统字号后按钮能跟着长高，
// 文字不会被裁掉（WCAG 1.4.12；modern-web-guidance: typography
// 「DON'T set a fixed height ... on elements that contain text, such as buttons」）。
// 纯图标按钮没有文字，仍需固定方块以保住 36×36 的点击目标（>= 24×24）。
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1 text-sm',
  md: 'min-h-10 px-4 py-2 text-sm',
  icon: 'size-9 p-0',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 加载中：禁用交互并显示 spinner，同时保留原有文案宽度。 */
  loading?: boolean;
  /** 以子元素为渲染宿主（例如把按钮样式套到 <Link> 上）。 */
  asChild?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    asChild = false,
    icon,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  const content = asChild ? (
    children
  ) : (
    <>
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </>
  );

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </Comp>
  );
});
