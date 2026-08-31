// 数据库 CLI：migrate / seed / ping。
// 仅面向本地开发与运维，依赖 pg 驱动，因此不并入 index.ts（避免被打进 API bundle）。
// 运行方式：node packages/db/src/cli.ts migrate
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { migrations } from './migrations.generated.ts';
import { runMigrations, type SqlExecutor } from './migrator.ts';

const { Pool } = pg;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const SEED_UNITS: ReadonlyArray<readonly [string, string, string]> = [
  ['SH-CN', '上海集货', 'COLLECTOR'],
  ['GZ-CN', '广州集货', 'COLLECTOR'],
  ['WH-HU', '匈牙利仓', 'WAREHOUSE'],
  ['WH-AT', '奥地利仓', 'WAREHOUSE'],
  ['ST-XX', 'XX超市', 'RETAILER'],
  ['ST-YY', 'YY超市', 'RETAILER'],
];

const SEED_ADMIN = {
  entraSub: 'seed-admin-placeholder',
  email: 'admin@example.com',
  name: 'Seed Admin',
};

function loadEnvFile(): void {
  for (const path of [join(repoRoot, '.env'), join(repoRoot, '.dev.vars')]) {
    try {
      const text = readFileSync(path, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && !(match[1] in process.env)) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      // 文件不存在时忽略
    }
  }
}

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Provide a PostgreSQL connection string (see docs/db-setup.md).',
    );
  }
  return url;
}

function makePool() {
  const ssl = (process.env.DB_SSL ?? '').toLowerCase();
  const sslConfig = ssl === 'true' || ssl === '1' ? { rejectUnauthorized: false } : undefined;
  return new Pool({ connectionString: getConnectionString(), ssl: sslConfig });
}

function help(): void {
  console.log(
    [
      'Usage: node packages/db/src/cli.ts <command>',
      '',
      'Commands:',
      '  migrate   Apply all pending migrations (idempotent).',
      '  seed      Insert example business units (idempotent).',
      '  ping      Test DB connectivity with SELECT 1.',
      '',
      'Env:',
      '  DATABASE_URL  PostgreSQL connection string (required).',
      '  DB_SSL        Set to "true" to enable SSL (rejectUnauthorized: false).',
      '  SEED_ADMIN    Set to "1" to also insert a placeholder admin user.',
    ].join('\n'),
  );
}

async function ping(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query('SELECT 1 AS ok');
  if (rows[0]?.ok !== 1) throw new Error('SELECT 1 returned unexpected result');
  console.log('OK: database reachable (SELECT 1 = 1)');
}

async function seed(exec: SqlExecutor, withAdmin: boolean): Promise<void> {
  const values = SEED_UNITS.map(([code, name, type]) => `('${code}', '${name}', '${type}')`).join(
    ',\n  ',
  );
  await exec.query(
    `INSERT INTO business_units (code, name, type) VALUES\n  ${values}\nON CONFLICT (code) DO NOTHING`,
  );

  if (withAdmin) {
    await exec.query(
      `INSERT INTO users (entra_sub, email, name, role, status)
       VALUES ('${SEED_ADMIN.entraSub}', '${SEED_ADMIN.email}', '${SEED_ADMIN.name}', 'ADMIN', 'ACTIVE')
       ON CONFLICT (entra_sub) DO NOTHING`,
    );
  }

  console.log(`seeded ${SEED_UNITS.length} business unit(s)${withAdmin ? ' + admin placeholder' : ''}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const command = process.argv[2] ?? 'help';

  if (command === 'help' || command === '--help' || command === '-h') {
    help();
    return;
  }

  const pool = makePool();
  try {
    const executor: SqlExecutor = {
      query: async (sql) => pool.query(sql),
    };

    if (command === 'ping') {
      await ping(pool);
      return;
    }

    if (command === 'migrate') {
      const result = await runMigrations(executor, migrations);
      console.log(
        `migrations applied: ${result.applied.length} (${result.applied.join(', ') || 'none'}); skipped: ${result.skipped.length}`,
      );
      return;
    }

    if (command === 'seed') {
      const withAdmin =
        process.argv.includes('--with-admin') || (process.env.SEED_ADMIN ?? '') === '1';
      await seed(executor, withAdmin);
      return;
    }

    help();
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
