import { afterEach, describe, expect, it, vi } from 'vitest';

import { readPicked, writePicked } from './pickingState';

// 勾选是「仓库取货现场」的唯一记录，丢了就得重新点一遍，所以存取契约要钉住：
// 幂等、按单隔离、坏数据不炸页面。

function stubLocalStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  vi.stubGlobal('localStorage', storage);
  return { data };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('拣货勾选持久化', () => {
  it('写入后可读回', () => {
    stubLocalStorage();
    writePicked('order-1', ['line-a', 'line-b']);
    expect(readPicked('order-1')).toEqual(['line-a', 'line-b']);
  });

  it('按销售单隔离，互不串单', () => {
    stubLocalStorage();
    writePicked('order-1', ['line-a']);
    writePicked('order-2', ['line-b']);
    expect(readPicked('order-1')).toEqual(['line-a']);
    expect(readPicked('order-2')).toEqual(['line-b']);
    expect(readPicked('order-3')).toEqual([]);
  });

  it('清空后读回空数组', () => {
    stubLocalStorage();
    writePicked('order-1', ['line-a']);
    writePicked('order-1', []);
    expect(readPicked('order-1')).toEqual([]);
  });

  it('内容损坏时返回空数组而不是抛异常', () => {
    const { data } = stubLocalStorage();
    data.set('otunlink.sales.picked.order-1', '{not json');
    expect(() => readPicked('order-1')).not.toThrow();
    expect(readPicked('order-1')).toEqual([]);
  });

  it('非数组内容被忽略', () => {
    const { data } = stubLocalStorage();
    data.set('otunlink.sales.picked.order-1', '{"a":1}');
    expect(readPicked('order-1')).toEqual([]);
  });

  it('数组里混入非字符串时只保留行 id', () => {
    const { data } = stubLocalStorage();
    data.set('otunlink.sales.picked.order-1', JSON.stringify(['line-a', 42, null]));
    expect(readPicked('order-1')).toEqual(['line-a']);
  });

  it('localStorage 不可用（隐私模式）时不抛异常', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => writePicked('order-1', ['line-a'])).not.toThrow();
    expect(readPicked('order-1')).toEqual([]);
  });
});
