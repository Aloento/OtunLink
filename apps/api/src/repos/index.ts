import type { Env, Repos } from '../types';
import { createExecutor } from '../db';
import { createMemoryRepos } from './memory';
import { createSqlRepos } from './sql';

export { createMemoryRepos } from './memory';
export { createSqlRepos } from './sql';

/**
 * 默认装配：DB 可用 → SQL（Drizzle 前 stopgap）；不可用 → null。
 * 测试注入 createMemoryRepos 的替身即可。
 */
export async function defaultGetRepos(env: Env): Promise<Repos | null> {
  const exec = await createExecutor(env);
  return exec ? createSqlRepos(exec) : null;
}

/**
 * 开发/测试兜底：优先 SQL；无 DB 时退回内存实现，保证本地联调可跑通。
 * 内存实现进程级隔离、重启清空，绝不可用于生产。
 */
export async function devGetRepos(env: Env): Promise<Repos | null> {
  const repos = await defaultGetRepos(env);
  return repos ?? createMemoryRepos();
}
