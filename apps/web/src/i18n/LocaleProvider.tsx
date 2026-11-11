import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { AppLocale } from '@otunlink/shared';

import { changeLocale, readStoredLocale } from './index';

// 语言上下文：持有当前语言状态并联动 i18next 与 document.documentElement.lang。
// 文案本地化只有一条路径：组件内 t() + html lang（不再有组件库层面的 locale 注入）。

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale());

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    void changeLocale(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
