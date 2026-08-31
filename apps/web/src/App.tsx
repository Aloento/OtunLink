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
import { ShipmentDetailPage } from './pages/shipments/ShipmentDetailPage';
import { ShipmentFormPage } from './pages/shipments/ShipmentFormPage';
import { ShipmentsPage } from './pages/shipments/ShipmentsPage';
import { RequireActive, RequireAuth, RequirePermission } from './routes/guards';
import { CALLBACK_PATH, LOGIN_PATH, ROUTES, type RouteKey } from './routes/routes';

// 业务页面（除工作台与物品目录外）在 ck-03/ck-04 以「开发中」占位。
const PLACEHOLDER_KEYS = [
  'inbound',
  'outbound',
  'returns',
  'sales',
  'inventory',
  'notifications',
  'adminUsers',
  'adminUnits',
] as const satisfies readonly RouteKey[];

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
