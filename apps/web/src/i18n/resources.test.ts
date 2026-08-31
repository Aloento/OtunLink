import { describe, expect, it } from 'vitest';

import { en } from './resources/en';
import { zhCN } from './resources/zh-CN';

function leafKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    leafKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n resources', () => {
  it('en and zh-CN share an identical key structure', () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(zhCN).sort());
  });

  it('exposes the expected top-level namespaces', () => {
    expect(Object.keys(zhCN)).toEqual(
      expect.arrayContaining(['app', 'nav', 'login', 'pending', 'common', 'roles', 'status', 'errors']),
    );
  });
});
