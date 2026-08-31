// 国际化常量与语言归一化（design.md §8.3）。
// 文案资源位于 apps/web/src/i18n/resources；此处只放语言语义与跨端共用的判定逻辑。

export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'zh-CN';

/** 语言偏好持久化键（前端 localStorage；与 users.locale 约定一致）。 */
export const LOCALE_STORAGE_KEY = 'otunlink.locale';

/**
 * 将任意语言标识（如 en-US、zh、zh_CN）归一化为受支持的 AppLocale。
 * 无法识别时回退到默认语言 zh-CN。
 */
export function normalizeLocale(raw: string | null | undefined): AppLocale {
  if (!raw) return DEFAULT_LOCALE;
  const lower = raw.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}
