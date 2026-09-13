import { MutationObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { clearQueryCache, createQueryClient, refreshAfterWrite } from './queryClient';

/** 等待微任务队列清空，让 onSuccess 里发起的失效（fire-and-forget）落到缓存上。 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createQueryClient', () => {
  it('全局默认以新鲜为先：staleTime 0 + 挂载/聚焦/重连都重取', () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions().queries;

    expect(defaults?.staleTime).toBe(0);
    expect(defaults?.refetchOnMount).toBe(true);
    expect(defaults?.refetchOnWindowFocus).toBe(true);
    expect(defaults?.refetchOnReconnect).toBe(true);
  });

  it('任何 mutation 成功后兜底失效全部查询', async () => {
    const client = createQueryClient();
    client.setQueryData(['items', 'list'], []);

    const observer = new MutationObserver(client, { mutationFn: async () => 'ok' });
    await observer.mutate();
    await flush();

    expect(client.getQueryState(['items', 'list'])?.isInvalidated).toBe(true);
  });

  it('meta.skipRefresh 的 mutation（非数据写入）不触发失效', async () => {
    const client = createQueryClient();
    client.setQueryData(['items', 'list'], []);

    const observer = new MutationObserver(client, {
      meta: { skipRefresh: true },
      mutationFn: async () => 'ok',
    });
    await observer.mutate();
    await flush();

    expect(client.getQueryState(['items', 'list'])?.isInvalidated).toBe(false);
  });
});

describe('refreshAfterWrite', () => {
  it('失效除签名 URL 之外的全部查询', async () => {
    const client = createQueryClient();
    client.setQueryData(['items', 'list'], []);
    client.setQueryData(['files', 'file-1', 'url'], { url: 'https://example.test/a.png' });

    await refreshAfterWrite(client);

    expect(client.getQueryState(['items', 'list'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['files', 'file-1', 'url'])?.isInvalidated).toBe(false);
  });
});

describe('clearQueryCache', () => {
  it('清空内存缓存，且无 IndexedDB 环境不报错', async () => {
    const client = createQueryClient();
    client.setQueryData(['items', 'list'], []);

    await clearQueryCache(client);

    expect(client.getQueryData(['items', 'list'])).toBeUndefined();
  });
});
