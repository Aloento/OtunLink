// 将 migrations/*.sql 嵌入为 src/migrations.generated.ts，供 CLI/API 在无文件系统
// （Cloudflare Workers）或直接分发场景下执行迁移。drizzle-kit generate 后运行。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migrationsDir = join(root, 'migrations');
const outFile = join(root, 'src', 'migrations.generated.ts');

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

const entries = [];
for (const file of files) {
  const sql = await readFile(join(migrationsDir, file), 'utf8');
  entries.push({ name: basename(file, '.sql'), sql });
}

const body = JSON.stringify(entries, null, 2);

const content = `// 本文件由 scripts/embed-migrations.mjs 自动生成，勿手改。
// 内容为 packages/db/migrations/*.sql 的嵌入快照。
import type { Migration } from './migrator';

export const migrations: Migration[] = ${body};
`;

await writeFile(outFile, content, 'utf8');
console.log(`embedded ${entries.length} migration(s) -> src/migrations.generated.ts`);
