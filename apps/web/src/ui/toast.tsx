import { Toaster } from 'sonner';

// 全局轻提示：写操作的成功/失败反馈。表单校验错误仍然留在字段旁边（就地可见），
// 这里只承担「动作已经发生」的确认，避免用户点完按钮不知道有没有生效。
// polite 播报由 sonner 内建的 role="status" 提供，不要改成 assertive。
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      richColors={false}
      duration={3200}
      toastOptions={{
        classNames: {
          toast:
            'rounded-[var(--radius-card)] border border-line bg-surface text-ink shadow-[var(--shadow-overlay)] text-[13px]',
          description: 'text-ink-muted text-xs',
          actionButton: 'bg-brand-600 text-white text-xs',
          cancelButton: 'bg-surface-muted text-ink-soft text-xs',
        },
      }}
    />
  );
}

export { toast } from 'sonner';
