import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并类名：clsx 处理条件拼接，tailwind-merge 消除同属性冲突
 * （例如调用方传 `px-2` 覆盖组件的 `px-4`）。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
