import { Navigate, Route, Routes } from 'react-router-dom';

import { Permissions } from '@otunlink/shared';

import { AppLayout } from './layout/AppLayout';
import { CallbackPage } from './pages/CallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PartnershipsPage } from './pages/partnerships/PartnershipsPage';
import { ItemDetailPage } from './pages/items/ItemDetailPage';
import { ItemFormPage } from './pages/items/ItemFormPage';
import { ItemsPage } from './pages/items/ItemsPage';
import { InboundDetailPage } from './pages/inbound/InboundDetailPage';
import { InboundFormPage } from './pages/inbound/InboundFormPage';
import { InboundListPage } from './pages/inbound/InboundListPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { OutboundDetailPage } from './pages/outbound/OutboundDetailPage';
import { OutboundFormPage } from './pages/outbound/OutboundFormPage';
import { OutboundListPage } from './pages/outbound/OutboundListPage';
import { RetailPricesPage } from './pages/retail-prices/RetailPricesPage';
import { ReturnDetailPage } from './pages/returns/ReturnDetailPage';
import { ReturnsListPage } from './pages/returns/ReturnsListPage';
import { SalesDetailPage } from './pages/sales/SalesDetailPage';
import { SalesFormPage } from './pages/sales/SalesFormPage';
import { SalesListPage } from './pages/sales/SalesListPage';
import { ShipmentDetailPage } from './pages/shipments/ShipmentDetailPage';
import { ShipmentFormPage } from './pages/shipments/ShipmentFormPage';
import { ShipmentsPage } from './pages/shipments/ShipmentsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminUnitsPage } from './pages/admin/AdminUnitsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { TestEmailPage } from './pages/admin/TestEmailPage';
import { RequireActive, RequireAuth, RequirePermission } from './routes/guards';
import { CALLBACK_PATH, LOGIN_PATH, ROUTES } from './routes/routes';

// 业务页面均已实现为真实页面（工作台、通知、物品目录、发货/入库/出库/库存/退货/销售/零售价 + 管理端）。
// 原「开发中」占位已移除。

export default function App() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route path={CALLBACK_PATH} element={<CallbackPage />} />

      <Route
        element={
          <RequireAuth>
            <RequireActive>
              <AppLayout />
            </RequireActive>
          </RequireAuth>
        }
      >
        <Route
          path={ROUTES.dashboard.path}
          element={
            <RequirePermission permissions={ROUTES.dashboard.permissions}>
              <DashboardPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.notifications.path}
          element={
            <RequirePermission permissions={ROUTES.notifications.permissions}>
              <NotificationsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.items.path}
          element={
            <RequirePermission permissions={ROUTES.items.permissions}>
              <ItemsPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.items.path}/new`}
          element={
            <RequirePermission permissions={[Permissions.ITEMS_WRITE]}>
              <ItemFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.items.path}/:id/edit`}
          element={
            <RequirePermission permissions={[Permissions.ITEMS_WRITE]}>
              <ItemFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.items.path}/:id`}
          element={
            <RequirePermission permissions={ROUTES.items.permissions}>
              <ItemDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.shipments.path}
          element={
            <RequirePermission permissions={ROUTES.shipments.permissions}>
              <ShipmentsPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.shipments.path}/new`}
          element={
            <RequirePermission permissions={[Permissions.SHIPMENTS_CREATE]}>
              <ShipmentFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.shipments.path}/:id/edit`}
          element={
            <RequirePermission permissions={[Permissions.SHIPMENTS_CREATE]}>
              <ShipmentFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.shipments.path}/:id`}
          element={
            <RequirePermission permissions={ROUTES.shipments.permissions}>
              <ShipmentDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.inbound.path}
          element={
            <RequirePermission permissions={ROUTES.inbound.permissions}>
              <InboundListPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.inbound.path}/new`}
          element={
            <RequirePermission permissions={[Permissions.INBOUND_CONFIRM]}>
              <InboundFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.inbound.path}/:id`}
          element={
            <RequirePermission permissions={ROUTES.inbound.permissions}>
              <InboundDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.outbound.path}
          element={
            <RequirePermission permissions={ROUTES.outbound.permissions}>
              <OutboundListPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.outbound.path}/new`}
          element={
            <RequirePermission permissions={[Permissions.STOCK_WRITE]}>
              <OutboundFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.outbound.path}/:id/edit`}
          element={
            <RequirePermission permissions={[Permissions.STOCK_WRITE]}>
              <OutboundFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.outbound.path}/:id`}
          element={
            <RequirePermission permissions={ROUTES.outbound.permissions}>
              <OutboundDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.partnerships.path}
          element={
            <RequirePermission permissions={ROUTES.partnerships.permissions}>
              <PartnershipsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.inventory.path}
          element={
            <RequirePermission permissions={ROUTES.inventory.permissions}>
              <InventoryPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.retailPrices.path}
          element={
            <RequirePermission permissions={ROUTES.retailPrices.permissions}>
              <RetailPricesPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.returns.path}
          element={
            <RequirePermission permissions={ROUTES.returns.permissions}>
              <ReturnsListPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.returns.path}/:id`}
          element={
            <RequirePermission permissions={ROUTES.returns.permissions}>
              <ReturnDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.sales.path}
          element={
            <RequirePermission permissions={ROUTES.sales.permissions}>
              <SalesListPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.sales.path}/new`}
          element={
            <RequirePermission permissions={[Permissions.SALES_CREATE]}>
              <SalesFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.sales.path}/:id/edit`}
          element={
            <RequirePermission permissions={[Permissions.SALES_CREATE]}>
              <SalesFormPage />
            </RequirePermission>
          }
        />
        <Route
          path={`${ROUTES.sales.path}/:id`}
          element={
            <RequirePermission permissions={ROUTES.sales.permissions}>
              <SalesDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.adminUsers.path}
          element={
            <RequirePermission permissions={ROUTES.adminUsers.permissions}>
              <AdminUsersPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.adminUnits.path}
          element={
            <RequirePermission permissions={ROUTES.adminUnits.permissions}>
              <AdminUnitsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.adminAuditLogs.path}
          element={
            <RequirePermission permissions={ROUTES.adminAuditLogs.permissions}>
              <AuditLogsPage />
            </RequirePermission>
          }
        />
        <Route
          path={ROUTES.adminTestEmail.path}
          element={
            <RequirePermission permissions={ROUTES.adminTestEmail.permissions}>
              <TestEmailPage />
            </RequirePermission>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
