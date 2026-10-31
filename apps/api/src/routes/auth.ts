import { Hono } from 'hono';

import { enforcePermanentAdminRole, isPermanentAdminEmail } from '../lib/admins';
import { publicUserDto } from '../lib/dto';
import { dbQueryFailed, dbUnavailable, ok } from '../lib/http';
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
    try {
      if (!user) {
        const claims = auth.claims;
        const email =
          claims.email ?? claims.preferredUsername ?? `${claims.oid ?? claims.sub}@placeholder.invalid`;
        user = await repos.users.create({
          // 优先存稳定的 oid（objectId），保证与该用户在管理端「新增用户」填写的标识一致，
          // 之后管理员可直接为此记录分配岗位；无 oid 时回退 sub。
          entraSub: claims.oid ?? claims.sub,
          email,
          name: claims.name ?? claims.sub,
          status: 'PENDING',
          role: isPermanentAdminEmail(email, c.env) ? 'ADMIN' : undefined,
        });
      }

      if (user && isPermanentAdminEmail(user.email, c.env) && user.role !== 'ADMIN') {
        user = await repos.users.update(user.id, { role: 'ADMIN' });
      }
    } catch (error) {
      // 开户写入失败（唯一约束冲突、DB 连接中断…）同样要给前端可读的 code 与状态码，
      // 否则和其它异常一样只剩一句「服务器或网络异常」。
      console.error('[auth/me] 开户/角色校正失败:', error);
      return dbQueryFailed(c, error, '开户失败');
    }

    const guardedUser = enforcePermanentAdminRole(user, c.env);
    return ok(c, publicUserDto(guardedUser!));
  });

  return router;
}
