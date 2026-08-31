import { hasPermission, type Permission, type UserRole } from '@otunlink/shared';

// 路由访问判定：permissions 为空表示所有 ACTIVE 用户可访问；
// 否则任意一项命中即放行（OR 语义，对应岗位能力集）。

export function canAccessPermissions(
  role: UserRole | null | undefined,
  permissions: readonly Permission[],
): boolean {
  if (permissions.length === 0) return true;
  return permissions.some((permission) => hasPermission(role, permission));
}
