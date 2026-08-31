import type { SqlExecutor } from '@otunlink/db';

// 惰性动态导入 pg，避免将 Node 专属驱动打进 Worker bundle。
// 仅在运行时确实需要（本地 dev / 无 Hyperdrive 且配置了 DATABASE_URL）时才加载。
type LazyImporter = (specifier: 'pg') => Promise<Record<string, unknown>>;
const lazyImport: LazyImporter = (specifier) => import(specifier);

interface PgLike {
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

interface HyperdriveLike {
  connect?: () => Promise<{ query(sql: string): Promise<{ rows: Record<string, unknown>[] }> }>;
}

let cachedPool: { url: string; pool: PgLike } | null = null;

/**
 * 从 Worker env 构建 SqlExecutor：
 * 1. 优先使用 Hyperdrive 绑定（生产推荐）；
 * 2. 其次在配置了 DATABASE_URL 时惰性加载 pg 连接池（本地开发）。
 * 两者都不可用则返回 null（调用方返回 MIGRATION_UNAVAILABLE）。
 */
export async function createExecutor(env: Record<string, unknown>): Promise<SqlExecutor | null> {
  const hyperdrive = env.HYPERDRIVE as HyperdriveLike | undefined;
  if (hyperdrive && typeof hyperdrive.connect === 'function') {
    const conn = await hyperdrive.connect();
    return { query: (sql) => conn.query(sql) };
  }

  const url = typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.length > 0
    ? env.DATABASE_URL
    : undefined;
  if (!url) return null;

  try {
    const cached = cachedPool;
    if (cached && cached.url === url) {
      return { query: (sql) => cached.pool.query(sql) };
    }

    const mod = await lazyImport('pg');
    const Pool = (mod.Pool ?? mod.default) as new (options: { connectionString: string }) => PgLike;
    const pool = new Pool({ connectionString: url });
    cachedPool = { url, pool };
    return { query: (sql) => pool.query(sql) };
  } catch {
    return null;
  }
}
