import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  normalizeLocale,
} from './i18n';

describe('normalizeLocale', () => {
  it('normalizes Chinese variants to zh-CN', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeLocale('zh_CN')).toBe('zh-CN');
    expect(normalizeLocale('zh')).toBe('zh-CN');
    expect(normalizeLocale('ZH-cn')).toBe('zh-CN');
  });

  it('normalizes English variants to en', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('EN')).toBe('en');
  });

  it('falls back to zh-CN for unknown or empty input', () => {
    expect(normalizeLocale('fr')).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale('')).toBe(DEFAULT_LOCALE);
  });

  it('exposes supported locales and the storage key', () => {
    expect(SUPPORTED_LOCALES).toEqual(['zh-CN', 'en']);
    expect(LOCALE_STORAGE_KEY).toBe('otunlink.locale');
    expect(DEFAULT_LOCALE).toBe('zh-CN');
  });
});
