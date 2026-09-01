import type { AppLocale } from '@otunlink/shared';

// 日期/金额/数字格式化。
// 时间存储为 UTC ISO；渲染时按业务单元时区（unit.timezone）换算。
// 金额不做汇率换算，仅按单元本位币（unit.baseCurrency，CNY/EUR/USD）格式化。

const INTL_LOCALE: Record<AppLocale, string> = {
  'zh-CN': 'zh-CN',
  en: 'en-US',
};

function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

function dateOptions(timezone?: string): Intl.DateTimeFormatOptions {
  return timezone
    ? { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }
    : { year: 'numeric', month: '2-digit', day: '2-digit' };
}

function dateTimeOptions(timezone?: string): Intl.DateTimeFormatOptions {
  return {
    ...dateOptions(timezone),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
}

/** 日期（按 locale）；timezone 为空时用运行环境时区。 */
export function formatDate(value: Date | string | number, locale: AppLocale, timezone?: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], dateOptions(timezone)).format(toDate(value));
}

/** 日期 + 时间。 */
export function formatDateTime(
  value: Date | string | number,
  locale: AppLocale,
  timezone?: string,
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], dateTimeOptions(timezone)).format(toDate(value));
}

/** 金额（币种符号 + 千分位 + 两位小数）；未知币种回退为普通小数。 */
export function formatMoney(amount: number, currency: string, locale: AppLocale): string {
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat(INTL_LOCALE[locale], {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

/** 普通数字（默认最多两位小数，可用于数量）。 */
export function formatNumber(
  value: number,
  locale: AppLocale,
  maximumFractionDigits = 2,
): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}
