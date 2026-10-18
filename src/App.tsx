import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { setUnauthorizedHandler } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
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
      <Route path="/login" element={<LoginPage />} />

      {/* Any signed-in user */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/pos" element={<PosPage />} />

          {/* Admin only */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/orders" element={<OrdersPage />} />
            <Route path="/admin/menu" element={<MenuPage />} />
            <Route path="/admin/inventory" element={<InventoryPage />} />
            <Route path="/admin/kitchen" element={<KitchenPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/pos" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
