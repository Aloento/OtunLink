import { Permissions, type Permission } from '@otunlink/shared';

// 路由表（design.md §6.1 全部路由）+ 导航分组。
// 业务页面在 ck-03 均以「开发中」占位；权限映射遵循 design.md §3.2 权限矩阵。

export interface AppRouteDef {
  path: string;
  /** i18n 键（nav.*） */
  navKey: string;
  /** 访问所需能力；空数组 = 所有 ACTIVE 用户可访问。 */
  permissions: readonly Permission[];
}

export const ROUTES = {
  dashboard: { path: '/', navKey: 'dashboard', permissions: [] },
  shipments: {
    path: '/shipments',
    navKey: 'shipments',
    permissions: [Permissions.SHIPMENTS_READ],
  },
  items: { path: '/items', navKey: 'items', permissions: [Permissions.ITEMS_READ] },
  inbound: {
    path: '/inbound',
    navKey: 'inbound',
    permissions: [Permissions.INBOUND_CONFIRM],
  },
  outbound: {
    path: '/outbound',
    navKey: 'outbound',
    permissions: [Permissions.STOCK_WRITE],
  },
  returns: {
    path: '/returns',
    navKey: 'returns',
    permissions: [
      Permissions.SHIPMENT_RETURNS_CREATE,
      Permissions.SHIPMENT_RETURNS_HANDLE,
      Permissions.AFTER_SALE_CREATE,
      Permissions.AFTER_SALE_RECEIVE,
    ],
  },
  sales: {
    path: '/sales',
    navKey: 'sales',
    permissions: [Permissions.SALES_CREATE, Permissions.SALES_REQUEST],
  },
  inventory: {
    path: '/inventory',
    navKey: 'inventory',
    permissions: [Permissions.STOCK_READ],
  },
  retailPrices: {
    path: '/retail-prices',
    navKey: 'retailPrices',
    permissions: [Permissions.RETAIL_PRICES_READ],
  },
  notifications: { path: '/notifications', navKey: 'notifications', permissions: [] },
  adminUsers: {
    path: '/admin/users',
    navKey: 'adminUsers',
    permissions: [Permissions.USERS_ADMIN],
  },
  adminUnits: {
    path: '/admin/units',
    navKey: 'adminUnits',
    permissions: [Permissions.UNITS_ADMIN],
  },
} as const satisfies Record<string, AppRouteDef>;

export type RouteKey = keyof typeof ROUTES;

/** 主导航（业务）与管理员导航分组，用于侧边栏/顶部/底部导航渲染。 */
export const NAV_MAIN: RouteKey[] = [
  'dashboard',
  'shipments',
  'items',
  'inbound',
  'outbound',
  'returns',
  'sales',
  'inventory',
  'notifications',
];

export const NAV_ADMIN: RouteKey[] = ['adminUsers', 'adminUnits'];

/** 登录回调与登录页路径。 */
export const LOGIN_PATH = '/login';
export const CALLBACK_PATH = '/auth/callback';
