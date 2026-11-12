import { cn } from '../lib/cn';

// 加载占位：比居中 Spinner 更能保持布局稳定（不会在数据到达时把内容整体推一下），
// 也让用户先看到「这里会有多少行」。
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-[var(--radius-control)] bg-surface-hover', 'motion-reduce:animate-none', className)}
    />
  );
}

/** 表格骨架：列数固定、行数可调，形状与真实行高一致。 */
export function SkeletonRows({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} aria-hidden>
          {Array.from({ length: columns }, (_, cellIndex) => (
            <td key={cellIndex}>
              <Skeleton className={cn('h-3', cellIndex === 0 ? 'w-32' : 'w-20')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
