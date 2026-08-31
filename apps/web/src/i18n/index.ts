import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  type AppLocale,
} from '@otunlink/shared';

import { en } from './resources/en';
import { zhCN } from './resources/zh-CN';

export const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
} as const;

let initialized = false;

/** 读取 localStorage 中持久化的语言偏好（SSR/异常安全）。 */
export function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** 将语言偏好写入 localStorage（异常安全，配额/隐私模式不崩溃）。 */
export function persistLocale(locale: AppLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 忽略持久化失败（隐私模式等）
  }
}

function applyDocumentLocale(locale: AppLocale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

/** 初始化 i18next（幂等）。文案资源随包内联，使用同步初始化。 */
export function initI18n(): typeof i18n {
  if (!initialized) {
    initialized = true;
    const initial = readStoredLocale();
    i18n.use(initReactI18next).init({
      resources,
      lng: initial,
      fallbackLng: 'zh-CN',
      supportedLngs: ['zh-CN', 'en'],
      interpolation: { escapeValue: false },
      initAsync: false,
      returnNull: false,
    });
    applyDocumentLocale(initial);
  }
  return i18n;
}

/** 切换语言：持久化 + 同步 document 语言 + 通知 i18next。 */
export async function changeLocale(locale: AppLocale): Promise<void> {
  persistLocale(locale);
  applyDocumentLocale(locale);
  await i18n.changeLanguage(locale);
}
