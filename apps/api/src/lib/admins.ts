import type { UserRole } from '@otunlink/shared';

import type { Env, UserRecord } from '../types';

export function getPermanentAdminEmail(env?: Pick<Env, 'PERMANENT_ADMIN_EMAIL'>): string {
  const fromEnv = env?.PERMANENT_ADMIN_EMAIL ??
    (typeof process !== 'undefined' ? process.env.PERMANENT_ADMIN_EMAIL : undefined) ??
    '';
  return fromEnv.trim().toLowerCase();
}

export function isPermanentAdminEmail(
  email: string | null | undefined,
  env?: Pick<Env, 'PERMANENT_ADMIN_EMAIL'>,
): boolean {
  const target = getPermanentAdminEmail(env);
  return !!target && (email ?? '').trim().toLowerCase() === target;
}

export function enforcePermanentAdminRole(
  user: UserRecord | null | undefined,
  env?: Pick<Env, 'PERMANENT_ADMIN_EMAIL'>,
): UserRecord | null {
  if (!user) return null;
  if (isPermanentAdminEmail(user.email, env) && user.role !== 'ADMIN') {
    return { ...user, role: 'ADMIN' as UserRole, updatedAt: new Date() };
  }
  return user;
}

export function assertNotLockedAdmin(
  user: UserRecord | null | undefined,
  env?: Pick<Env, 'PERMANENT_ADMIN_EMAIL'>,
): void {
  if (user && isPermanentAdminEmail(user.email, env)) {
    const email = getPermanentAdminEmail(env) || '永久管理员';
    throw new Error(`${email} 为永久管理员，不能被修改或删除`);
  }
}
