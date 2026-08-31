import { runMigrations as realRunMigrations, type Migration, type SqlExecutor } from '@otunlink/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { adminRouter } from './routes/admin';

type AppEnv = {
  Bindings: Record<string, unknown>;
  Variables: { authRole: string | null };
};

const TEST_MIGRATIONS: Migration[] = [
  { name: '0001_init', sql: 'CREATE TABLE a (id int);' },
  { name: '0002_more', sql: 'CREATE TABLE b (id int);' },
];

// 内存驱动：复用真实 runMigrations，仅替换底层 SQL 执行，验证端到端幂等。
class FakeDb implements SqlExecutor {
  readonly applied = new Map<string, boolean>();
  readonly executed: string[] = [];

  async query(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
    this.executed.push(sql.trim());
    const statement = sql.trim();
    if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') {
      return { rows: [] };
    }
    if (statement.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
      return { rows: [] };
    }
    if (statement.startsWith('SELECT name FROM schema_migrations')) {
      return { rows: [...this.applied.keys()].map((name) => ({ name })) };
    }
    const insert = statement.match(/^INSERT INTO schema_migrations \(name\) VALUES \('([^']+)'\)$/);
    if (insert) {
      this.applied.set(insert[1], true);
      return { rows: [] };
    }
    return { rows: [] };
  }
}

function makeApp(overrides: {
  secret?: string;
  executor?: SqlExecutor | null;
  runMigrations?: typeof realRunMigrations;
} = {}) {
  const db = new FakeDb();
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const role = c.req.header('X-Test-Role') ?? null;
    c.set('authRole', role);
    await next();
  });

  const router = adminRouter({
    getAdminSecret: () => overrides.secret ?? '',
    getExecutor: async () => (overrides.executor === undefined ? db : overrides.executor),
    runMigrations: overrides.runMigrations,
    migrations: TEST_MIGRATIONS,
  });

  app.route('/api/v1/admin', router);

  return { app, db };
}

describe('POST /api/v1/admin/migrate', () => {
  it('returns 503 MIGRATION_DISABLED when ADMIN_SECRET is not configured', async () => {
    const { app } = makeApp({ secret: '' });
    const res = await app.request('/api/v1/admin/migrate', {
      method: 'POST',
      headers: { 'X-Admin-Secret': 's3cret', 'X-Test-Role': 'ADMIN' },
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'MIGRATION_DISABLED' } });
  });

  it('returns 401 when X-Admin-Secret header is missing', async () => {
    const { app } = makeApp({ secret: 's3cret' });
    const res = await app.request('/api/v1/admin/migrate', {
      method: 'POST',
      headers: { 'X-Test-Role': 'ADMIN' },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('returns 401 when X-Admin-Secret does not match', async () => {
    const { app } = makeApp({ secret: 's3cret' });
    const res = await app.request('/api/v1/admin/migrate', {
      method: 'POST',
      headers: { 'X-Admin-Secret': 'wrong', 'X-Test-Role': 'ADMIN' },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('returns 403 when caller is not ADMIN', async () => {
    const { app } = makeApp({ secret: 's3cret' });
    const res = await app.request('/api/v1/admin/migrate', {
      method: 'POST',
      headers: { 'X-Admin-Secret': 's3cret', 'X-Test-Role': 'COLLECTOR' },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('returns 503 MIGRATION_UNAVAILABLE when no database is configured', async () => {
    const { app } = makeApp({ secret: 's3cret', executor: null });
    const res = await app.request('/api/v1/admin/migrate', {
      method: 'POST',
      headers: { 'X-Admin-Secret': 's3cret', 'X-Test-Role': 'ADMIN' },
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'MIGRATION_UNAVAILABLE' } });
  });

  it('applies migrations and is idempotent across repeated calls', async () => {
    const { app, db } = makeApp({ secret: 's3cret' });
    const headers = { 'X-Admin-Secret': 's3cret', 'X-Test-Role': 'ADMIN' };

    const first = await app.request('/api/v1/admin/migrate', { method: 'POST', headers });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, applied: ['0001_init', '0002_more'], skipped: [] });
    expect(db.applied.size).toBe(2);

    const second = await app.request('/api/v1/admin/migrate', { method: 'POST', headers });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, applied: [], skipped: ['0001_init', '0002_more'] });
    expect(db.applied.size).toBe(2);
  });

  it('returns 500 MIGRATION_FAILED when a migration throws', async () => {
    const { app } = makeApp({ secret: 's3cret' });
    const failingRun = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const router = adminRouter({
      getAdminSecret: () => 's3cret',
      getExecutor: async () => new FakeDb(),
      runMigrations: failingRun,
      migrations: TEST_MIGRATIONS,
    });
    const testApp = new Hono<AppEnv>();
    testApp.use('*', async (c, next) => {
      c.set('authRole', 'ADMIN');
      await next();
    });
    testApp.route('/api/v1/admin', router);

    const res = await testApp.request('/api/v1/admin/migrate', {
      method: 'POST',
      headers: { 'X-Admin-Secret': 's3cret' },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: 'MIGRATION_FAILED' } });
    expect(failingRun).toHaveBeenCalledTimes(1);
  });
});
