import type { TranslationSchema } from './zh-CN';

// 英文文案资源；结构与 zh-CN 完全对齐（由 TranslationSchema 类型约束）。
export const en: TranslationSchema = {
  app: { name: 'OtunLink' },
  nav: {
    dashboard: 'Dashboard',
    shipments: 'Shipments',
    items: 'Items',
    inbound: 'Inbound',
    outbound: 'Outbound',
    returns: 'Returns',
    sales: 'Sales',
    inventory: 'Inventory',
    notifications: 'Notifications',
    adminUsers: 'Users',
    adminUnits: 'Units',
  },
  login: {
    title: 'OtunLink',
    description: 'Sign in with your corporate Entra ID (Microsoft 365) account',
    button: 'Sign in',
    unconfigured:
      'Entra ID environment variables are not configured (VITE_ENTRA_TENANT_ID / VITE_ENTRA_CLIENT_ID). See docs/auth-setup.md.',
  },
  pending: {
    title: 'Awaiting role assignment',
    waiting:
      'Your account has not been assigned a role yet. Ask an administrator to assign one in “Users”, then refresh.',
    disabled: 'Your account has been disabled. Please contact an administrator.',
    refresh: 'Refresh',
    logout: 'Sign out',
  },
  callback: { message: 'Completing sign-in…' },
  common: {
    loading: 'Loading…',
    logout: 'Sign out',
    switchLanguage: 'Switch language',
    refresh: 'Refresh',
    backHome: 'Back to dashboard',
    notAssigned: 'Not assigned',
    development: 'In development',
  },
  roles: {
    ADMIN: 'Admin',
    COLLECTOR: 'Collector',
    WAREHOUSE: 'Warehouse',
    RETAILER: 'Retailer',
  },
  status: {
    ACTIVE: 'Active',
    PENDING: 'Pending',
    DISABLED: 'Disabled',
  },
  errors: {
    VALIDATION_ERROR: 'Validation failed, please check your input',
    UNAUTHORIZED: 'Your session has expired, please sign in again',
    FORBIDDEN: 'You do not have permission to perform this action',
    NOT_FOUND: 'The requested resource does not exist',
    CONFLICT: 'The operation conflicts with the current state, please refresh and retry',
    INTERNAL_ERROR: 'Internal server error, please try again later',
    DATABASE_UNAVAILABLE: 'The database is temporarily unavailable, please try again later',
    AUTH_CONFIGURATION_ERROR: 'Authentication service is misconfigured, please contact an administrator',
    MIGRATION_DISABLED: 'Data migration is disabled',
    MIGRATION_UNAVAILABLE: 'Data migration is temporarily unavailable',
    MIGRATION_FAILED: 'Data migration failed',
    NETWORK: 'Network error, please check your connection',
    UNKNOWN: 'An unknown error occurred, please try again later',
  },
  dashboard: {
    title: 'Dashboard',
    description:
      'Aggregated to-dos will appear here (pending counting / discrepancies / returns / shipments / vouchers / after-sales / expired batches).',
    empty: 'No to-dos',
  },
  placeholder: { title: 'In development' },
  forbidden: {
    title: 'Access denied',
    description: 'Your role does not have access to this page.',
  },
};
