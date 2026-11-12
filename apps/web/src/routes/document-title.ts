import { ROUTES, type RouteKey } from './routes';

// 路径 → 导航项。详情页（/sales/:id）没有独立路由条目，按最长前缀归到所属模块：
// 这样「销售单详情」的标题仍然是「销售单」，而不是退化成站点名。
//
// 单独抽成纯函数是为了可测：标题算错时用户看到的是「所有页面都叫 OtunLink」，
// 而浏览器标签页和读屏都靠它区分页面（WCAG 2.4.2 Page Titled）。
const ENTRIES: Array<[string, RouteKey]> = (Object.keys(ROUTES) as RouteKey[])
  .map((key) => [ROUTES[key].path, key] as [string, RouteKey])
  .sort((a, b) => b[0].length - a[0].length);

export function navKeyForPath(pathname: string): RouteKey | null {
  for (const [path, key] of ENTRIES) {
    if (path === '/') {
      if (pathname === '/') return key;
      continue;
    }
    if (pathname === path || pathname.startsWith(`${path}/`)) return key;
  }
  return null;
}
