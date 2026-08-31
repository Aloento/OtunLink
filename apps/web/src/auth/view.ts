import type { UserStatus } from '@otunlink/shared';

// 视图选择（纯函数，便于单测）：基于路径 + 登录态 + 用户状态。

export type AppView = 'callback' | 'login' | 'loading' | 'pending' | 'home';

export function selectView(
  pathname: string,
  authenticated: boolean,
  meStatus: UserStatus | null | undefined,
): AppView {
  if (pathname.endsWith('/auth/callback')) return 'callback';
  if (!authenticated) return 'login';
  if (meStatus === undefined || meStatus === null) return 'loading';
  if (meStatus !== 'ACTIVE') return 'pending';
  return 'home';
}
