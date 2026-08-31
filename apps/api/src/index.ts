import { Hono } from 'hono';

const app = new Hono();

app.get('/api/v1/health', (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

export default app;
