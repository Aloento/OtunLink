// 认证与 RBAC 常量：岗位、数据范围、权限矩阵。
// 放 shared 便于 api / web 共用同一套语义；db 包中的 pgEnum 保持独立（数据库层枚举）。
// RETAILER 为外部商铺买家——不可见发货单/物流、不可管理物品，零售价只读。

export const USER_ROLES = ['ADMIN', 'COLLECTOR', 'WAREHOUSE', 'RETAILER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'PENDING', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const UNIT_TYPES = ['COLLECTOR', 'WAREHOUSE', 'RETAILER'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/**
 * 权限常量（能力）——与权限矩阵逐行对应。
 * 各模块中间件统一使用这些常量，避免魔法字符串。
 */
export const Permissions = {
  ITEMS_READ: 'items:read',
  ITEMS_WRITE: 'items:write',
  SHIPMENTS_READ: 'shipments:read',
  SHIPMENTS_CREATE: 'shipments:create',
  SHIPMENTS_TRANSFER: 'shipments:transfer',
  TRACKINGS_MANAGE: 'trackings:manage',
  COUNTING_WRITE: 'counting:write',
  REVIEWS_SUBMIT: 'reviews:submit',
  REVIEWS_APPROVE: 'reviews:approve',
  INBOUND_CONFIRM: 'inbound:confirm',
  SHIPMENT_RETURNS_CREATE: 'shipment-returns:create',
  SHIPMENT_RETURNS_HANDLE: 'shipment-returns:handle',
  STOCK_READ: 'stock:read',
  STOCK_WRITE: 'stock:write',
  RETAIL_PRICES_READ: 'retail-prices:read',
  RETAIL_PRICES_WRITE: 'retail-prices:write',
  SALES_REQUEST: 'sales:request',
  SALES_CREATE: 'sales:create',
  SALES_SEND: 'sales:send',
  SALES_CANCEL: 'sales:cancel',
  SALES_PAYMENT: 'sales:payment',
  SALES_CONFIRM_RECEIPT: 'sales:confirm-receipt',
  AFTER_SALE_CREATE: 'after-sale:create',
  AFTER_SALE_RECEIVE: 'after-sale:receive',
  UNITS_READ: 'units:read',
  UNITS_ADMIN: 'units:admin',
  USERS_ADMIN: 'users:admin',
  AUDIT_ADMIN: 'audit:admin',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * 岗位 → 能力映射（权限矩阵）。
 * ADMIN 拥有全部能力；其余岗位按矩阵逐项授予。
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  ADMIN: Object.values(Permissions),
  COLLECTOR: [
    Permissions.ITEMS_READ,
    Permissions.ITEMS_WRITE,
    Permissions.SHIPMENTS_READ,
    Permissions.SHIPMENTS_CREATE,
    Permissions.SHIPMENTS_TRANSFER,
    Permissions.TRACKINGS_MANAGE,
    Permissions.REVIEWS_APPROVE,
    Permissions.SHIPMENT_RETURNS_HANDLE,
    Permissions.UNITS_READ,
  ],
  WAREHOUSE: [
    Permissions.ITEMS_READ,
    Permissions.ITEMS_WRITE,
    Permissions.SHIPMENTS_READ,
    Permissions.TRACKINGS_MANAGE,
    Permissions.COUNTING_WRITE,
    Permissions.REVIEWS_SUBMIT,
    Permissions.INBOUND_CONFIRM,
    Permissions.SHIPMENT_RETURNS_CREATE,
    Permissions.STOCK_READ,
    Permissions.STOCK_WRITE,
    Permissions.RETAIL_PRICES_READ,
    Permissions.RETAIL_PRICES_WRITE,
    Permissions.SALES_CREATE,
    Permissions.SALES_SEND,
    Permissions.SALES_CANCEL,
    Permissions.AFTER_SALE_RECEIVE,
    Permissions.UNITS_READ,
  ],
  RETAILER: [
    Permissions.ITEMS_READ,
    Permissions.STOCK_READ,
    Permissions.RETAIL_PRICES_READ,
    Permissions.SALES_REQUEST,
    Permissions.SALES_CREATE,
    Permissions.SALES_PAYMENT,
    Permissions.SALES_CONFIRM_RECEIPT,
    Permissions.AFTER_SALE_CREATE,
    Permissions.UNITS_READ,
  ],
};

/** 判断某岗位是否具备某能力；PENDING/未知岗位一律 false。 */
export function hasPermission(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
