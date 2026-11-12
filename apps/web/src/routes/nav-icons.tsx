import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Boxes,
  Building2,
  Handshake,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScrollText,
  Tags,
  Truck,
  Undo2,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { RouteKey } from './routes';

// 路由图标：侧栏、底部导航、命令面板共用同一份，避免三处各画一套导致
// 「同一个页面在不同入口换了张脸」。
export const NAV_ICONS: Partial<Record<RouteKey, ReactNode>> = {
  dashboard: <LayoutDashboard aria-hidden className="size-4" />,
  shipments: <Truck aria-hidden className="size-4" />,
  items: <Package aria-hidden className="size-4" />,
  inbound: <ArrowDownToLine aria-hidden className="size-4" />,
  outbound: <ArrowUpFromLine aria-hidden className="size-4" />,
  returns: <Undo2 aria-hidden className="size-4" />,
  sales: <ReceiptText aria-hidden className="size-4" />,
  partnerships: <Handshake aria-hidden className="size-4" />,
  inventory: <Boxes aria-hidden className="size-4" />,
  retailPrices: <Tags aria-hidden className="size-4" />,
  adminUsers: <Users aria-hidden className="size-4" />,
  adminUnits: <Building2 aria-hidden className="size-4" />,
  adminAuditLogs: <ScrollText aria-hidden className="size-4" />,
  adminTestEmail: <ScrollText aria-hidden className="size-4" />,
  notifications: <Bell aria-hidden className="size-4" />,
};
