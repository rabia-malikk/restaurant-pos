import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import type { Role, UserFeature } from '@/types';

export default function ProtectedRoute({ roles, features }: { roles?: Role[]; features?: UserFeature[] }) {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  if (status === 'loading') {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/pos" replace />;
  if (features && user.role !== 'admin' && !features.some((feature) => user.features.includes(feature))) {
    return <Navigate to="/pos" replace />;
  }
  return <Outlet />;
}
