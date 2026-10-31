import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAutoRedirect,
  markAutoRedirect,
  shouldAutoRedirect,
  WINDOW_MS,
} from './silentRetry';

// 闸门的意义：允许「刷新失败 → 自动重登」恢复一次，但不能变成
// 「加载 → 重定向 → 加载」的死循环（那会表现为浏览器不停跳转、永远登录不上）。

function stubStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  vi.stubGlobal('window', { sessionStorage: storage });
  return { data, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('silentRetry', () => {
  it('没有存储记录时允许自动重定向', () => {
    stubStorage();
    expect(shouldAutoRedirect()).toBe(true);
  });

  it('记录一次后不再允许（窗口内）', () => {
    stubStorage();
    const now = 1_000_000;
    markAutoRedirect(now);
    expect(shouldAutoRedirect(now + 1000)).toBe(false);
  });

  it('超出时间窗口后重新允许，并重置计数', () => {
    const { data } = stubStorage();
    const now = 1_000_000;
    markAutoRedirect(now);
    expect(shouldAutoRedirect(now + WINDOW_MS + 1)).toBe(true);

    markAutoRedirect(now + WINDOW_MS + 1);
    expect(JSON.parse(data.get('otunlink.auth.silentRedirect') ?? '{}')).toMatchObject({
      attempts: 1,
    });
  });

  it('clearAutoRedirect 恢复为允许', () => {
    stubStorage();
    markAutoRedirect(1_000_000);
    clearAutoRedirect();
    expect(shouldAutoRedirect(1_000_000)).toBe(true);
  });

  it('存储内容损坏时退化为允许，不抛异常', () => {
    const { storage } = stubStorage();
    storage.setItem('otunlink.auth.silentRedirect', '{not json');
    expect(() => shouldAutoRedirect()).not.toThrow();
    expect(shouldAutoRedirect()).toBe(true);
    expect(() => markAutoRedirect()).not.toThrow();
  });

  it('没有 window（SSR/测试）时不抛异常', () => {
    expect(() => shouldAutoRedirect()).not.toThrow();
    expect(() => markAutoRedirect()).not.toThrow();
    expect(() => clearAutoRedirect()).not.toThrow();
  });
});
