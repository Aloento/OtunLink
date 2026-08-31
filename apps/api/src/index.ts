import { Hono } from 'hono';

import { createExecutor } from './db';
import { adminRouter } from './routes/admin';

export type AppEnv = {
  Bindings: Record<string, unknown>;
  Variables: { authRole: string | null };
};

const app = new Hono<AppEnv>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));

app.route(
  '/api/v1/admin',
  adminRouter({
    getAdminSecret: (env) =>
      typeof env.ADMIN_SECRET === 'string' && env.ADMIN_SECRET.length > 0
        ? env.ADMIN_SECRET
        : undefined,
    getExecutor: createExecutor,
  }),
);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

export default app;
