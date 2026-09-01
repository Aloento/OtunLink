import type { Env, Repos } from '../types';
import { createExecutor } from '../db';
import { createSqlRepos } from './sql';

export { createSqlRepos } from './sql';

/**
 * 默认装配：DB 可用 → SQL（Drizzle 前 stopgap）；不可用 → null。
 * 测试注入 createMemoryRepos 的替身即可。
 */
export async function defaultGetRepos(env: Env): Promise<Repos | null> {
  const exec = await createExecutor(env);
  return exec ? createSqlRepos(exec) : null;
}
