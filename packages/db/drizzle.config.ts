import { defineConfig } from 'drizzle-kit';

// generate 为离线操作，dbCredentials.url 仅用于 push/migrate 等需要连库的命令。
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/otunlink',
  },
});
