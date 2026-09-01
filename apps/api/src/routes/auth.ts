import { Hono } from 'hono';

import { publicUserDto } from '../lib/dto';
import { dbUnavailable, ok } from '../lib/http';
import type { AppEnv } from '../types';

// GET /auth/me：自动开户入口。
// 已由 authenticate 中间件校验 JWT 并装载 repos；此处按 sub 查 users，
// 无记录则创建 PENDING 用户（role 待管理员分配）。
export function authRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.get('/me', async (c) => {
    const auth = c.get('auth');
    const repos = c.get('repos');
    if (!repos) return dbUnavailable(c);

    let user = auth.user;
    if (!user) {
      const claims = auth.claims;
      user = await repos.users.create({
        // 优先存稳定的 oid（objectId），保证与该用户在管理端「新增用户」填写的标识一致，
        // 之后管理员可直接为此记录分配岗位；无 oid 时回退 sub。
        entraSub: claims.oid ?? claims.sub,
        email: claims.email ?? claims.preferredUsername ?? `${claims.oid ?? claims.sub}@placeholder.invalid`,
        name: claims.name ?? claims.sub,
        status: 'PENDING',
      });
    }

    return ok(c, publicUserDto(user));
  });

  return router;
}
