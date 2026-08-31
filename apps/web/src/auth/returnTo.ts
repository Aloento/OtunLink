// 深链恢复（defect #9）：在未登录被引导到 /login 前，把原目标路径暂存到 sessionStorage，
// 登录会话就绪后由 LoginPage / CallbackPage 恢复跳转，避免刷新或直达受保护路由时丢失深链。

const KEY = 'otunlink.returnTo';

export function setReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // sessionStorage 不可用时忽略，退化为跳转首页。
  }
}

export function consumeReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}
