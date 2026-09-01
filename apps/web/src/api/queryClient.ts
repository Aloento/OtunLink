import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient, type Persister } from '@tanstack/react-query-persist-client';
import { createStore, del, get, set } from 'idb-keyval';

// TanStack Query 客户端 + IndexedDB 持久化。
// 白名单（前缀匹配）：items / units / dict / notifications / dashboard。
// TTL：24h（maxAge）；buster 用于升级缓存结构时整体失效。

const CACHE_BUSTER = 'v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const WHITELIST_PREFIXES = ['items', 'units', 'dict', 'notifications', 'dashboard'];

function inWhitelist(key: string): boolean {
  return WHITELIST_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}-`) || key.startsWith(`${prefix}_`));
}

/** 基于 idb-keyval 的 Persister（@tanstack/react-query-persist-client v5 已移除 createAsyncStoragePersister）。 */
function createIdbPersister(): Persister {
  const store = createStore('otunlink', 'react-query');
  return {
    async persistClient(client) {
      await set('client', client, store);
    },
    async restoreClient() {
      return (await get('client', store)) ?? undefined;
    },
    async removeClient() {
      await del('client', store);
    },
  };
}

/** 仅在浏览器（存在 IndexedDB）时持久化；SSR/测试环境静默跳过。 */
export async function initQueryPersistence(queryClient: QueryClient): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await persistQueryClient({
      queryClient,
      persister: createIdbPersister(),
      maxAge: MAX_AGE_MS,
      buster: CACHE_BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) =>
          // 仅持久化已成功的查询：避免把 fetching/pending 查询脱水成 Promise 导致
          // idb-keyval 结构克隆报 DataCloneError，也避免恢复「pending 查询」在引导期重新触发请求。
          inWhitelist(query.queryKey[0] as string) && query.state.status === 'success',
      },
    });
  } catch {
    // 持久化失败不影响功能（隐私模式/配额等）。
  }
}

/** 创建全局唯一 QueryClient；默认策略避免无谓重取。 */
export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
  void initQueryPersistence(queryClient);
  return queryClient;
}
