import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { cn } from '../lib/cn';

/**
 * 模态对话框：直接构建在原生 <dialog> + showModal() 之上。
 *
 * 为什么不是自建遮罩层：原生模态已经免费提供 inert 页面、焦点陷阱与焦点归还、
 * 顶层渲染、Esc 与移动端返回手势关闭。自建这些会有无穷的边缘 bug。
 * 见 modern-web-guidance: dialog（Rule 1）与 prevent-page-scroll-under-modal-dialog。
 *
 * 因此这里**不**设置 role="dialog"、aria-modal、焦点循环、inert 切换或 Esc 监听。
 *
 * 用法：
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent>
 *       <DialogHeader>
 *         <DialogTitle>标题</DialogTitle>
 *         <DialogDescription>说明</DialogDescription>
 *       </DialogHeader>
 *       …正文…
 *       <DialogFooter>…按钮…</DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 *
 * 需要指定初始焦点时，在目标元素上加 `data-autofocus`。
 */

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  closeLabel: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext(component: string): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) throw new Error(`<${component}> 必须渲染在 <Dialog> 内`);
  return context;
}

export function Dialog({
  open,
  onOpenChange,
  closeLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 右上角关闭按钮的可访问名称（i18n）。 */
  closeLabel: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const value = useMemo(
    () => ({ open, setOpen: onOpenChange, titleId, closeLabel }),
    [open, onOpenChange, titleId, closeLabel],
  );
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export function DialogContent({
  className,
  children,
  /** 点击遮罩关闭（默认开启，与 Esc / 返回手势一致）。 */
  lightDismiss = true,
  ...props
}: {
  className?: string;
  children: ReactNode;
  lightDismiss?: boolean;
  'aria-label'?: string;
}) {
  const { open, setOpen, titleId } = useDialogContext('DialogContent');
  const ref = useRef<HTMLDialogElement>(null);
  const labelledBy = props['aria-label'] ? undefined : titleId;

  // 受控同步：打开走 showModal()（而不是 open 属性或 show()），
  // 只有模态才提供 inert 页面与焦点归还。
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (!dialog.isConnected) return;
      dialog.showModal();
      // 初始焦点：优先 data-autofocus 标记；否则聚焦第一个真正的控件 ——
      // 浏览器默认会先聚焦表头右上角的关闭按钮，用户得先 Tab 一次才能开始填表。
      const explicit = dialog.querySelector<HTMLElement>('[data-autofocus]');
      if (explicit) {
        explicit.focus();
      } else {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).find((el) => !el.hasAttribute('data-dialog-dismiss') && el.offsetParent !== null);
        focusable?.focus();
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }

    // 组件在模态打开状态下被卸载（例如路由跳转）时，必须显式关闭，
    // 否则页面可能停留在 inert 状态。
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  // 原生关闭事件（Esc、返回手势、closedby 触发的 light dismiss）回传受控状态。
  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  // closedby="any" 的降级：缺少 closedBy 支持时按指针按下/抬起都在框外才算 light dismiss。
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !lightDismiss) return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) dialog.close();
      pressedOutside = false;
    };
    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [lightDismiss]);

  return (
    <dialog
      ref={ref}
      className={cn('app-dialog', className)}
      aria-labelledby={labelledBy}
      aria-label={props['aria-label']}
      // Safari 尚未支持 closedby；缺失时仅失去点击外部关闭，Esc 仍有效。
      {...({ closedby: lightDismiss ? 'any' : 'closerequest' } as Record<string, string>)}
      onClose={handleClose}
    >
      {children}
    </dialog>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  const { closeLabel } = useDialogContext('DialogHeader');
  return (
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
      <DialogClose label={closeLabel} />
    </div>
  );
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  const { titleId } = useDialogContext('DialogTitle');
  return (
    <h2 id={titleId} className={cn('text-base font-semibold text-ink', className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-sm text-ink-muted', className)}>{children}</p>;
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4', className)}>
      {children}
    </div>
  );
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DialogClose({
  className,
  children,
  label,
}: {
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  const { setOpen, closeLabel } = useDialogContext('DialogClose');
  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label={label ?? closeLabel}
      // DialogContent 的默认初始焦点会跳过它：关闭按钮不该抢走第一个字段的焦点。
      data-dialog-dismiss
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink',
        className,
      )}
    >
      {children ?? <X aria-hidden className="size-4" />}
    </button>
  );
}
