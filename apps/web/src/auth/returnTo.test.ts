import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeReturnTo, setReturnTo } from './returnTo';

describe('returnTo', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a full path (pathname + search + hash)', () => {
    setReturnTo('/items/new?category=fresh#top');
    expect(consumeReturnTo()).toBe('/items/new?category=fresh#top');
  });

  it('consumes the stored value exactly once', () => {
    setReturnTo('/items');
    expect(consumeReturnTo()).toBe('/items');
    expect(consumeReturnTo()).toBeNull();
  });
});
