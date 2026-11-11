import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

import { cn } from '../lib/cn';

// 表单字段容器：统一 label / 说明 / 错误文案的排版与可访问性接线。
//
// 单元素子节点会自动注入 id、aria-describedby、aria-invalid、required，
// 避免调用方手写 id 造成 label/控件/描述三者对不上。
// 错误文案只应在「用户已交互」或「提交被服务端拒绝」后出现，
// 不要在首次渲染时就把必填项标红。
//
// 子节点不是单个可获得焦点的表单控件时（例如 <ImageUpload>、按钮组），
// 传 `unlabeled`：label 退化成纯文本分组名（role="group" + aria-labelledby），
// 不再生成指向不存在 id 的 `<label for>`。

export function Field({
  label,
  hint,
  error,
  required,
  className,
  labelClassName,
  children,
  id,
  srOnlyLabel,
  unlabeled = false,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
  id?: string;
  srOnlyLabel?: boolean;
  /** 子节点不是单个可标注控件时置 true：用分组语义代替 `<label for>`。 */
  unlabeled?: boolean;
}) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const labelId = `${controlId}-label`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  // 只有当子节点恰好是一个元素时才注入属性；多子节点（例如输入框 + 单位后缀）
  // 原样渲染，由调用方自己接 aria-describedby。
  // 注入失败时绝不能再给 <label> 挂 for —— 那会指向一个不存在的 id，标签与控件失联。
  const child = Children.count(children) === 1 ? Children.only(children) : null;
  const injectable = !unlabeled && isValidElement(child);
  const control = injectable
    ? cloneElement(child as ReactElement<Record<string, unknown>>, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })
    : children;

  const labelClass = cn('text-sm font-medium text-ink-soft', srOnlyLabel && 'sr-only', labelClassName);
  const labelContent = (
    <>
      {label}
      {required ? (
        <span aria-hidden className="ms-1 text-danger-600">
          *
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
      role={unlabeled && label ? 'group' : undefined}
      aria-labelledby={unlabeled && label ? labelId : undefined}
    >
      {label ? (
        unlabeled ? (
          <span id={labelId} className={labelClass}>
            {labelContent}
          </span>
        ) : (
          <label htmlFor={injectable ? controlId : undefined} className={labelClass}>
            {labelContent}
          </label>
        )
      ) : null}
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {/* 错误文案只在调用方传入 error 时出现；role="alert" 让它在插入 DOM 时被朗读，
          而不是等用户再 Tab 一次才从 aria-describedby 里读到。 */}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
