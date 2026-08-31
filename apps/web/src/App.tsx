import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Permissions } from '@otunlink/shared';

import { PlaceholderPage } from './components/PlaceholderPage';
import { AppLayout } from './layout/AppLayout';
import { CallbackPage } from './pages/CallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
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
import { ShipmentDetailPage } from './pages/shipments/ShipmentDetailPage';
import { ShipmentFormPage } from './pages/shipments/ShipmentFormPage';
import { ShipmentsPage } from './pages/shipments/ShipmentsPage';
import { RequireActive, RequireAuth, RequirePermission } from './routes/guards';
import { CALLBACK_PATH, LOGIN_PATH, ROUTES, type RouteKey } from './routes/routes';

// 业务页面（除工作台、物品目录、发货/入库/出库/库存/退货外）在 ck-03/ck-04 以「开发中」占位。
const PLACEHOLDER_KEYS = ['sales', 'notifications', 'adminUsers', 'adminUnits'] as const satisfies readonly RouteKey[];

export default function App() {
  const { t } = useTranslation();

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
          path={`${ROUTES.outbound.path}/:id`}
          element={
            <RequirePermission permissions={ROUTES.outbound.permissions}>
              <OutboundDetailPage />
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
        {PLACEHOLDER_KEYS.map((key) => {
          const route = ROUTES[key];
          return (
            <Route
              key={route.path}
              path={route.path}
              element={
                <RequirePermission permissions={route.permissions}>
                  <PlaceholderPage title={t(`nav.${route.navKey}`)} />
                </RequirePermission>
              }
            />
          );
        })}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
