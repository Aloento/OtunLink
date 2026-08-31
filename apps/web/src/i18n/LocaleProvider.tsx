import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { AppLocale } from '@otunlink/shared';

import { changeLocale, readStoredLocale } from './index';

// 语言上下文：持有当前语言状态并联动 i18next 与 document.documentElement.lang。
// 注：当前 Fluent UI v9.74 的 FluentProvider 已移除 locale 属性（无内置文案本地化机制），
// 因此 Fluent 层面的本地化仅通过 html lang 与组件内 t() 实现。

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
