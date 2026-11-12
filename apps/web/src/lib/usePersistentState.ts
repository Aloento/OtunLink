import { useCallback, useState } from 'react';

/**
 * 持久化到 localStorage 的 useState：列宽、列显隐、密度这类「用户偏好」
 * 不应该每次刷新都回到默认值。读写失败（隐私模式、配额满）一律静默降级。
 */
export function usePersistentState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // 存不下就只保留内存态，不影响交互
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
