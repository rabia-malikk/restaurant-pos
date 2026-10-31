import { useEffect } from 'react';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { setUnauthorizedHandler } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import AdminSetupPage from '@/pages/AdminSetupPage';
import PosPage from '@/pages/PosPage';
import NotFoundPage from '@/pages/NotFoundPage';
import DashboardPage from '@/pages/admin/DashboardPage';
import OrdersPage from '@/pages/admin/OrdersPage';
import MenuPage from '@/pages/admin/MenuPage';
import InventoryPage from '@/pages/admin/InventoryPage';
import KitchenPage from '@/pages/admin/KitchenPage';
import UsersPage from '@/pages/admin/UsersPage';

export default function App() {
  useEffect(() => {
    setUnauthorizedHandler(() => useAuthStore.getState().clear());
    useAuthStore.getState().bootstrap();
  }, []);

  return (
    <Routes>
      <Route element={<InitialAdminGate />}>
        <Route path="/setup-admin" element={<AdminSetupPage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/pos" element={<PosPage />} />

            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="/admin" element={<DashboardPage />} />
              <Route path="/admin/inventory" element={<InventoryPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
            </Route>
            <Route element={<ProtectedRoute features={['orders']} />}>
              <Route path="/admin/orders" element={<OrdersPage />} />
            </Route>
            <Route element={<ProtectedRoute features={['menu']} />}>
              <Route path="/admin/menu" element={<MenuPage />} />
            </Route>
            <Route element={<ProtectedRoute features={['kitchen']} />}>
              <Route path="/admin/kitchen" element={<KitchenPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function InitialAdminGate() {
  const location = useLocation();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['auth', 'admin-setup-status'],
    queryFn: authApi.adminSetupStatus,
    staleTime: Infinity,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Checking initial setup" />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={() => refetch()}>Retry</Button>}
        >
          Could not check whether an admin account exists. Check the API/database connection and retry.
        </Alert>
      </Box>
    );
  }

  const isSetupPage = location.pathname === '/setup-admin';
  if (!data.adminExists && !isSetupPage) return <Navigate to="/setup-admin" replace />;
  if (data.adminExists && isSetupPage) return <Navigate to="/login" replace />;
  return <Outlet />;
}
