import { useEffect, useState } from 'react';

/** 输入防抖：搜索框每次按键都打接口会让 ERP 列表在慢网络下闪烁。 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
