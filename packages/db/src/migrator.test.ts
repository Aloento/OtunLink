import { describe, expect, it } from 'vitest';

import {
  getAppliedMigrations,
  MIGRATIONS_TABLE,
  runMigrations,
  type SqlExecutor,
} from './migrator';

// 内存模拟驱动：仅实现 SqlExecutor 接口，行为贴近真实 pg（事务、迁移记录表）。
class FakeDb implements SqlExecutor {
  readonly executed: string[] = [];
  private readonly migrations = new Map<string, { applied_at: Date }>();
  private throwOn: string | null = null;

  setThrowOn(sqlFragment: string): void {
    this.throwOn = sqlFragment;
  }

  async query(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
    this.executed.push(sql);
    const statement = sql.trim();

    if (this.throwOn && statement.includes(this.throwOn)) {
      throw new Error(`boom: ${this.throwOn}`);
    }
    if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') {
      return { rows: [] };
    }
    if (statement.startsWith(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}`)) {
      return { rows: [] };
    }
    if (statement.startsWith(`SELECT name FROM ${MIGRATIONS_TABLE}`)) {
      return { rows: [...this.migrations.keys()].map((name) => ({ name })) };
    }
    const insert = statement.match(/^INSERT INTO schema_migrations \(name\) VALUES \('([^']+)'\)$/);
    if (insert) {
      this.migrations.set(insert[1], { applied_at: new Date() });
      return { rows: [] };
    }
    return { rows: [] };
  }

  appliedNames(): string[] {
    return [...this.migrations.keys()];
  }
}

const MIGRATIONS = [
  { name: '0001_init', sql: 'CREATE TABLE a (id int);' },
  { name: '0002_more', sql: 'CREATE TABLE b (id int);' },
];

describe('runMigrations', () => {
  it('applies pending migrations in order and records them', async () => {
    const db = new FakeDb();
    const result = await runMigrations(db, MIGRATIONS);

    expect(result.applied).toEqual(['0001_init', '0002_more']);
    expect(result.skipped).toEqual([]);
    expect(db.appliedNames()).toEqual(['0001_init', '0002_more']);
  });

  it('is idempotent: second run applies nothing and skips all', async () => {
    const db = new FakeDb();
    await runMigrations(db, MIGRATIONS);
    const result = await runMigrations(db, MIGRATIONS);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['0001_init', '0002_more']);
  });

  it('applies only the pending subset when partially applied', async () => {
    const db = new FakeDb();
    await runMigrations(db, [MIGRATIONS[0]]);
    const result = await runMigrations(db, MIGRATIONS);

    expect(result.applied).toEqual(['0002_more']);
    expect(result.skipped).toEqual(['0001_init']);
  });

  it('splits drizzle-kit statement-breakpoint markers into individual statements', async () => {
    const db = new FakeDb();
    const result = await runMigrations(db, [
      {
        name: '0009_split',
        sql: 'CREATE TABLE a (id int);--> statement-breakpoint\nCREATE TABLE b (id int);--> statement-breakpoint\nCREATE INDEX a_idx ON a (id);',
      },
    ]);

    expect(result.applied).toEqual(['0009_split']);
    const body = db.executed.filter(
      (sql) => !['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) && !sql.startsWith('CREATE TABLE IF NOT EXISTS') && !sql.startsWith('SELECT name FROM') && !sql.startsWith('INSERT INTO schema_migrations'),
    );
    expect(body).toEqual([
      'CREATE TABLE a (id int);',
      'CREATE TABLE b (id int);',
      'CREATE INDEX a_idx ON a (id);',
    ]);
  });

  it('rolls back and rethrows when a migration fails', async () => {
    const db = new FakeDb();
    db.setThrowOn('CREATE TABLE b');
    await runMigrations(db, [MIGRATIONS[0]]);

    await expect(runMigrations(db, MIGRATIONS)).rejects.toThrow('0002_more');

    // 失败迁移未记录；事务已回滚。
    expect(db.appliedNames()).toEqual(['0001_init']);
    expect(db.executed.some((sql) => sql.trim() === 'ROLLBACK')).toBe(true);
  });
});

describe('getAppliedMigrations', () => {
  it('creates the tracking table and returns applied names', async () => {
    const db = new FakeDb();
    await db.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ('0001_init')`);
    const applied = await getAppliedMigrations(db);

    expect(applied.has('0001_init')).toBe(true);
    expect(
      db.executed.some((sql) =>
        sql.trim().startsWith(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}`),
      ),
    ).toBe(true);
  });
});
