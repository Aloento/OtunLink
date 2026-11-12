import { useEffect, useRef } from 'react';

type Handler = (event: KeyboardEvent) => void;

/**
 * 全局快捷键。组合串用 `mod+k` 这种写法，`mod` 在 macOS 上是 ⌘、其他平台是 Ctrl。
 * 输入框内默认不触发（除非显式 allowInInput），否则用户打字会被快捷键截走。
 */
export function useHotkeys(map: Record<string, Handler>, options: { allowInInput?: boolean } = {}) {
  const handlers = useRef(map);
  handlers.current = map;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (inField && !options.allowInInput) return;

      const parts: string[] = [];
      if (event.metaKey || event.ctrlKey) parts.push('mod');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
      parts.push(key);

      const handler = handlers.current[parts.join('+')];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options.allowInInput]);
}
