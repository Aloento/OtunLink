import type { Context, MiddlewareHandler } from 'hono';
import { ErrorCodes, hasPermission, type Permission, type UserRole } from '@otunlink/shared';

import type { AppEnv, AuthState, Repos, TokenClaims } from '../types';
import { dbUnavailable, forbidden, unauthorized } from '../lib/http';

type Ctx = Context<AppEnv>;

export interface AuthDeps {
  /** 校验 Bearer token，返回标准化 claims（生产走 jose/Entra，测试可注入替身）。 */
  verifyToken: (env: AppEnv['Bindings'], token: string) => Promise<TokenClaims>;
  /** 按需创建数据仓库；DB 不可达返回 null（调用方返回 503）。 */
  getRepos: (env: AppEnv['Bindings']) => Promise<Repos | null>;
}

export function authState(c: Ctx): AuthState {
  return c.get('auth');
}

export function reposOf(c: Ctx): Repos | null {
  return c.get('repos') ?? null;
}

function notProvisioned(c: Ctx) {
  // user 为 null：可能是「未开户」（DB 可用）或「DB 不可用」。区分返回码。
  if (!reposOf(c)) return dbUnavailable(c);
  return forbidden(c, '用户尚未开通（请先调用 /auth/me 自动开户）');
}

/**
 * 鉴权入口：解析 Authorization: Bearer → 校验 token → 查 users 挂到 c.var.auth。
 * 仅校验 token、装载用户，不做角色/状态判定（PENDING 用户也能通过，由后续中间件拦截）。
 */
export function authenticate(deps: AuthDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) {
      return c.json(
        { error: { code: ErrorCodes.UNAUTHORIZED, message: 'Missing bearer token' } },
        401,
      );
    }

    let claims: TokenClaims;
    try {
      claims = await deps.verifyToken(c.env, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        { error: { code: ErrorCodes.UNAUTHORIZED, message: `Invalid token: ${message}` } },
        401,
      );
    }

    let repos: Repos | null = null;
    try {
      repos = await deps.getRepos(c.env);
    } catch {
      repos = null;
    }

    let user = null;
    if (repos) {
      // 优先用稳定的 oid（与管理员在「新增用户」填写的 objectId 一致）关联，
      // 找不到再回退 sub，兼容历史按 sub 开户的记录（含现有管理员）。
      if (claims.oid) user = await repos.users.findByEntraSub(claims.oid);
      if (!user) user = await repos.users.findByEntraSub(claims.sub);
    }

    c.set('auth', { claims, user });
    c.set('repos', repos);
    await next();
  };
}

/** 要求已登录且账号 ACTIVE（PENDING/DISABLED 一律 403）。 */
export function requireActive(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('auth').user;
    if (!user) return notProvisioned(c);
    if (user.status !== 'ACTIVE') {
      return forbidden(c, '账号未激活，请联系管理员分配岗位');
    }
    await next();
  };
}

/** 要求已登录、ACTIVE 且岗位 ∈ roles。 */
export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('auth').user;
    if (!user) return notProvisioned(c);
    if (user.status !== 'ACTIVE') {
      return forbidden(c, '账号未激活，请联系管理员分配岗位');
    }
    if (!user.role || !roles.includes(user.role)) {
      return forbidden(c, `需要以下岗位之一: ${roles.join('/')}`);
    }
    await next();
  };
}

/** 要求已登录、ACTIVE 且具备全部给定权限（RBAC 权限矩阵）。 */
export function requirePermission(...permissions: Permission[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('auth').user;
    if (!user) return notProvisioned(c);
    if (user.status !== 'ACTIVE') {
      return forbidden(c, '账号未激活，请联系管理员分配岗位');
    }
    if (!permissions.every((permission) => hasPermission(user.role, permission))) {
      return forbidden(c, `缺少权限: ${permissions.join(', ')}`);
    }
    await next();
  };
}

/**
 * 要求已登录、ACTIVE 且具备给定权限中的任意一个（OR 语义）。
 * 用于多岗位可读的列表（如退货单：WAREHOUSE 发起方 / COLLECTOR 处理方均可查看）。
 */
export function requireAnyPermission(...permissions: Permission[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('auth').user;
    if (!user) return notProvisioned(c);
    if (user.status !== 'ACTIVE') {
      return forbidden(c, '账号未激活，请联系管理员分配岗位');
    }
    if (!permissions.some((permission) => hasPermission(user.role, permission))) {
      return forbidden(c, `缺少权限（任一）: ${permissions.join(', ')}`);
    }
    await next();
  };
}

/** 数据范围：scope_unit_id 为空 = 全量；非空 = 仅该单元（返回查询过滤条件）。 */
export function unitScopeFilter(auth: AuthState): { unitId: string } | null {
  const unitId = auth.user?.scopeUnitId ?? null;
  return unitId ? { unitId } : null;
}

/**
 * 数据范围赋值校验中间件：非 ADMIN 账号必须已绑定业务单元（scope_unit_id 非空），
 * 否则 403（「scope 空 = 全量」仅对 ADMIN 成立）；ADMIN 空 scope 放行 = 全量。
 * 应挂在所有按 scope 过滤的业务路由之前，确保 helper 只见到「ADMIN null」或「非 ADMIN 非空」两种输入。
 */
export function requireUnitScopeAssigned(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('auth').user;
    if (!user) return notProvisioned(c);
    if (user.status !== 'ACTIVE') {
      return forbidden(c, '账号未激活，请联系管理员分配岗位');
    }
    if (user.role !== 'ADMIN' && !user.scopeUnitId) {
      return forbidden(c, '账号未绑定业务单元，无法访问业务数据');
    }
    await next();
  };
}

/**
 * 数据范围校验中间件：当用户 scope_unit_id 非空时，目标单元必须等于其范围单元。
 * 用于后续业务路由（单据/库存等），本实现已落地并被单测覆盖。
 */
export function requireUnitScope(
  resolveUnitId: (c: Ctx) => string | null | undefined,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('auth').user;
    if (!user) return notProvisioned(c);
    if (user.status !== 'ACTIVE') {
      return forbidden(c, '账号未激活，请联系管理员分配岗位');
    }
    const scope = user.scopeUnitId;
    if (scope) {
      const target = resolveUnitId(c);
      if (target && target !== scope) {
        return forbidden(c, '数据范围越界（scope_unit_id 不匹配）');
      }
    }
    await next();
  };
}

export { unauthorized };
