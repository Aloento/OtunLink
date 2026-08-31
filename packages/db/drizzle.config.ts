import { defineConfig } from 'drizzle-kit';

// ck-00 占位：尚未建表。ck-01 起在此定义 Drizzle schema 并生成迁移（design.md §7）。
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: 'postgres://postgres:postgres@localhost:5432/otunlink',
  },
});
