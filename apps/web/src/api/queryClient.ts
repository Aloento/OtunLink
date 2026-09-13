import { MutationCache, QueryClient } from '@tanstack/react-query';
import { persistQueryClient, type Persister } from '@tanstack/react-query-persist-client';
import { createStore, del, get, set } from 'idb-keyval';

// TanStack Query 客户端 + IndexedDB 持久化。
// 新鲜度策略：任何写入都不得留下陈旧视图——全局 staleTime 0（挂载/聚焦即重取），
// 写操作后统一调用 refreshAfterWrite() 使缓存失效（见文件末尾）。
// 白名单（前缀匹配）：items / units / dict / notifications / dashboard。
// TTL：5min（maxAge）；buster 用于升级缓存结构时整体失效。

const CACHE_BUSTER = 'v2';
const MAX_AGE_MS = 5 * 60 * 1000;
const WHITELIST_PREFIXES = ['items', 'units', 'dict', 'notifications', 'dashboard'];
const IDB_DB_NAME = 'otunlink';
const IDB_STORE_NAME = 'react-query';
const IDB_CLIENT_KEY = 'client';

/** 签名 URL 查询（['files', id, 'url']）由对象存储直出、URL 15 分钟有效，与业务写入无关。 */
function isSignedUrlQuery(key: readonly unknown[]): boolean {
  return key[0] === 'files' && key[2] === 'url';
}

function inWhitelist(key: string): boolean {
  return WHITELIST_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}-`) || key.startsWith(`${prefix}_`));
}

const idbStore = createStore(IDB_DB_NAME, IDB_STORE_NAME);

/** 基于 idb-keyval 的 Persister（@tanstack/react-query-persist-client v5 已移除 createAsyncStoragePersister）。 */
function createIdbPersister(): Persister {
  return {
    async persistClient(client) {
      await set(IDB_CLIENT_KEY, client, idbStore);
    },
    async restoreClient() {
      return (await get(IDB_CLIENT_KEY, idbStore)) ?? undefined;
    },
    async removeClient() {
      await del(IDB_CLIENT_KEY, idbStore);
    },
  };
}

/**
 * 写操作后统一失效：所有查询标记为过期，活跃查询立即重取、非活跃查询在下次挂载时重取。
 * 仅排除签名 URL（['files', id, 'url']），其有效期由预签名决定，无需随业务写入重取。
 */
export function refreshAfterWrite(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => !isSignedUrlQuery(query.queryKey),
  });
}

/** 清理 IndexedDB 中持久化的查询缓存（会话失效/登出时调用，避免跨账号回放旧数据）。 */
export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await del(IDB_CLIENT_KEY, idbStore);
  } catch {
    // 无 IndexedDB 或隐私模式下清理失败不影响功能。
  }
}

/** 清空内存查询缓存 + 持久化缓存。 */
export async function clearQueryCache(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  await clearPersistedQueryCache();
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

/** 创建全局唯一 QueryClient；默认策略以「改动立即生效」为先。 */
export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    // 兜底网：任何 useMutation 成功后统一失效缓存，避免遗漏跨模块刷新。
    // 非数据写入的 mutation 可用 meta: { skipRefresh: true } 退出（如发测试邮件）。
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.skipRefresh) return;
        void refreshAfterWrite(queryClient);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
  void initQueryPersistence(queryClient);
  return queryClient;
}
