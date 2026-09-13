import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import { en } from './resources/en';
import { zhCN } from './resources/zh-CN';
import { unitLabel } from './units';

function translator(locale: 'zh-CN' | 'en') {
  const instance = i18next.createInstance();
  instance.init({
    resources: { 'zh-CN': { translation: zhCN }, en: { translation: en } },
    lng: locale,
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
    initAsync: false,
    returnNull: false,
  });
  return instance.t;
}

describe('unitLabel', () => {
  it('picks the wording group from the item minimum sale unit', () => {
    const t = translator('zh-CN');
    expect(unitLabel(t, 'PIECE', 'SPEC')).toBe('件');
    expect(unitLabel(t, 'PIECE', 'INNER')).toBe('个');
    expect(unitLabel(t, 'BOX', 'SPEC')).toBe('箱');
    expect(unitLabel(t, 'BOX', 'INNER')).toBe('盒');
  });

  it('uses the same wording groups in English', () => {
    const t = translator('en');
    expect(unitLabel(t, 'PIECE', 'SPEC')).toBe('Piece');
    expect(unitLabel(t, 'PIECE', 'INNER')).toBe('pc');
    expect(unitLabel(t, 'BOX', 'INNER')).toBe('box');
  });

  it('falls back to the specification unit group when the group is unknown', () => {
    const t = translator('zh-CN');
    expect(unitLabel(t, 'BOX', null)).toBe('箱');
    expect(unitLabel(t, 'BOX', undefined)).toBe('箱');
  });

  it('renders a placeholder when the row carries no unit key', () => {
    const t = translator('zh-CN');
    expect(unitLabel(t, null, 'SPEC')).toBe('—');
    expect(unitLabel(t, undefined, 'INNER')).toBe('—');
    expect(unitLabel(t, '', null)).toBe('—');
  });
});
