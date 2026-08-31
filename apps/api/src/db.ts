import type { SqlExecutor } from '@otunlink/db';
import postgres from 'postgres';

// Worker 运行时无 Node TCP，无法使用 `pg`。这里统一使用 postgres.js
// （官方 Hyperdrive 文档推荐）：Hyperdrive binding 提供 connectionString，
// postgres.js 通过 cloudflare:sockets 建立连接。
//
// 注意：postgres 客户端必须在每个请求内创建，不能模块级缓存——
// workerd 禁止跨请求复用 I/O 对象（socket 属于创建它的请求上下文），
// 复用会抛 "Cannot perform I/O on behalf of a different request"。
// 连接复用由 Hyperdrive（生产）负责，本地直连 DATABASE_URL 时开销可接受。
interface HyperdriveLike {
  connectionString?: string;
}

/**
 * 从 Worker env 构建 SqlExecutor（每次请求新建，见上方注释）：
 * 1. 优先使用 Hyperdrive binding 的 connectionString（生产推荐）；
 * 2. 其次在配置了 DATABASE_URL 时使用同一连接串（本地开发）。
 * 两者都不可用则返回 null（调用方返回 MIGRATION_UNAVAILABLE）。
 */
export async function createExecutor(env: Record<string, unknown>): Promise<SqlExecutor | null> {
  const hyperdrive = env.HYPERDRIVE as HyperdriveLike | undefined;
  const url =
    (hyperdrive && typeof hyperdrive.connectionString === 'string'
      ? hyperdrive.connectionString
      : undefined) ??
    (typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.length > 0
      ? env.DATABASE_URL
      : undefined);
  if (!url) return null;

  try {
    const sql = postgres(url, { max: 1, prepare: false });
    const client: SqlExecutor = {
      query: async (statement) => {
        const rows = await sql.unsafe(statement);
        return { rows: rows as unknown as Record<string, unknown>[] };
      },
    };
    return client;
  } catch {
    return null;
  }
}
