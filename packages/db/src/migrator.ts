// 迁移执行器（幂等、事务化、不依赖具体驱动）。
// 通过 SqlExecutor 抽象隔离驱动，便于在 API（Hyperdrive/worker）与 CLI（pg）中复用，
// 也便于在测试中注入内存实现。

export interface SqlExecutor {
  /** 执行一条 SQL（可含多条语句，由底层驱动/连接决定），返回结果行。 */
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface Migration {
  /** 迁移文件名（不含 .sql 后缀），作为已执行记录的主键。 */
  name: string;
  /** 完整迁移 SQL 文本。 */
  sql: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export const MIGRATIONS_TABLE = 'schema_migrations';

// drizzle-kit 生成的 SQL 用该标记分隔多条语句（非 SQL 语法），执行前需按此拆分。
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

const quoteLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

function splitStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** 确保 schema_migrations 表存在，并返回已执行迁移名集合。 */
export async function getAppliedMigrations(exec: SqlExecutor): Promise<Set<string>> {
  await exec.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`,
  );
  const { rows } = await exec.query(`SELECT name FROM ${MIGRATIONS_TABLE}`);
  return new Set(rows.map((row) => String(row.name)));
}

/**
 * 按顺序应用尚未执行的迁移。每个迁移在独立事务中执行：
 * 成功则写入 schema_migrations 并提交；失败则回滚并抛出。
 * 重复调用为幂等（已执行迁移跳过）。
 */
export async function runMigrations(
  exec: SqlExecutor,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  const appliedSet = await getAppliedMigrations(exec);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.name)) {
      skipped.push(migration.name);
      continue;
    }

    await exec.query('BEGIN');
    try {
      for (const statement of splitStatements(migration.sql)) {
        await exec.query(statement);
      }
      await exec.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (${quoteLiteral(migration.name)})`,
      );
      await exec.query('COMMIT');
    } catch (error) {
      await exec.query('ROLLBACK').catch(() => undefined);
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.name} failed: ${detail}`);
    }

    applied.push(migration.name);
    appliedSet.add(migration.name);
  }

  return { applied, skipped };
}
