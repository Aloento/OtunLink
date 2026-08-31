import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';

import { PlaceholderPage } from './components/PlaceholderPage';
import { AppLayout } from './layout/AppLayout';
import { CallbackPage } from './pages/CallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RequireActive, RequireAuth, RequirePermission } from './routes/guards';
import { CALLBACK_PATH, LOGIN_PATH, ROUTES, type RouteKey } from './routes/routes';

// 业务页面（除工作台外）在 ck-03 一律以「开发中」占位。
const PLACEHOLDER_KEYS = [
  'shipments',
  'items',
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
