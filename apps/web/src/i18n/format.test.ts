import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatMoney, formatNumber } from './format';

describe('formatMoney', () => {
  it('formats a known currency with symbol and two decimals', () => {
    expect(formatMoney(1234.5, 'CNY', 'zh-CN')).toContain('1,234.50');
    expect(formatMoney(1234.5, 'USD', 'en')).toContain('1,234.50');
  });

  it('falls back to plain decimals for an unknown currency code', () => {
    expect(formatMoney(12, 'XYZ', 'zh-CN')).toContain('12.00');
  });
});

describe('formatDate', () => {
  it('renders the year regardless of locale', () => {
    const d = new Date('2024-01-02T00:00:00Z');
    expect(formatDate(d, 'zh-CN', 'UTC')).toMatch(/2024/);
    expect(formatDate(d, 'en', 'UTC')).toMatch(/2024/);
  });
});

describe('formatDateTime', () => {
  it('renders date and time without crashing', () => {
    const d = new Date('2024-01-02T03:04:05Z');
    expect(formatDateTime(d, 'zh-CN', 'UTC')).toMatch(/2024/);
    expect(formatDateTime(d, 'en')).toMatch(/2024/);
  });

  it('appends a timezone offset suffix (UTC)', () => {
    const d = new Date('2024-01-02T03:04:05Z');
    expect(formatDateTime(d, 'en', 'UTC')).toMatch(/GMT/);
    expect(formatDateTime(d, 'zh-CN', 'UTC')).toMatch(/GMT/);
  });

  it('appends a timezone offset suffix for a fixed offset zone', () => {
    const d = new Date('2024-01-02T03:04:05Z');
    expect(formatDateTime(d, 'en', 'Etc/GMT-8')).toMatch(/GMT\+8/);
  });

  it('appends a timezone offset suffix when no timezone is passed', () => {
    const d = new Date('2024-01-02T03:04:05Z');
    expect(formatDateTime(d, 'en')).toMatch(/GMT/);
    expect(formatDate(d, 'en')).toMatch(/GMT/);
  });
});

describe('formatNumber', () => {
  it('rounds to the requested fraction digits', () => {
    expect(formatNumber(3.14159, 'en', 2)).toBe('3.14');
    expect(formatNumber(3, 'en', 2)).toBe('3');
  });
});
