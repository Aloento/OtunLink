import { defineConfig } from 'drizzle-kit';

// generate 为离线操作，dbCredentials.url 仅用于 push/migrate 等需要连库的命令。
export default defineConfig({
  dialect: 'postgresql',
  // 必须指向 index.ts：枚举定义在 enums.ts，drizzle-kit 只从导出对象收集枚举（schema.ts 仅 import）。
  schema: './src/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://<user>:<password>@localhost:5432/otunlink',
  },
});
