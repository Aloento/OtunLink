import { useEffect, useState } from 'react';

// 响应式断点查询（<768 / 768–1024 / >1024）。
//
// 断点值集中在这里：表格要不要切成卡片、外壳要不要换成底部导航，必须用同一个
// 阈值，否则会出现「导航已经是手机版、表格还在显示横向滚动」的错位。
export const MOBILE_QUERY = '(max-width: 767px)';
export const DESKTOP_QUERY = '(min-width: 1025px)';

export function useMediaQuery(query: string): boolean {
  // 没有 matchMedia 的环境（jsdom、极老的 WebView）按「不匹配」处理：
  // 桌面表格是默认形态，比在测试里抛错更接近真实降级行为。
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState<boolean>(() => (supported ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query, supported]);

  return matches;
}
