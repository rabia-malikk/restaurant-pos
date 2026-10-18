import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AppBar, Box, Button, Chip, Toolbar, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { useAuthStore } from '@/store/authStore';
import { usePosStore } from '@/store/posStore';
import { ordersApi } from '@/api/orders';
import { useSocket } from '@/hooks/useSocket';

const navButtonSx = {
  color: 'inherit',
  '&.active': { bgcolor: 'rgba(255,255,255,0.16)' },
} as const;

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  useSocket();

  const handleLogout = async () => {
    // Release any order still open on this screen before leaving.
    const open = usePosStore.getState().order;
    if (open) await ordersApi.release(open.id).catch(() => undefined);
    usePosStore.getState().reset();
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          <Box
            component="img"
            src="/hawt.png"
            alt="Restaurant logo"
            sx={{ width: 42, height: 42, objectFit: 'contain', mr: 0.5 }}
          />
          <Typography variant="h6" component="div" sx={{ mr: 2 }}>
            Serving Heat. Powering Business.
          </Typography>

          <Button component={NavLink} to="/pos" sx={navButtonSx}>
            POS
          </Button>
          {user.role === 'admin' && (
            <>
              <Button component={NavLink} to="/admin" end sx={navButtonSx}>
                Dashboard
              </Button>
              <Button component={NavLink} to="/admin/orders" sx={navButtonSx}>
                Orders
              </Button>
              <Button component={NavLink} to="/admin/menu" sx={navButtonSx}>
                Menu
              </Button>
              <Button component={NavLink} to="/admin/inventory" sx={navButtonSx}>
                Inventory
              </Button>
              <Button component={NavLink} to="/admin/kitchen" sx={navButtonSx}>
                Kitchen
              </Button>
              <Button component={NavLink} to="/admin/users" sx={navButtonSx} startIcon={<PeopleAltIcon />}>
                Users
              </Button>
            </>
          )}

          <Box sx={{ flex: 1 }} />
          <Chip
            label={`${user.name} (${user.role === 'admin' ? 'Admin' : 'Staff'})`}
            sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: 'inherit' }}
          />
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Outlet />
      </Box>
      <Box
        component="footer"
        sx={{ py: 1, px: 2, textAlign: 'center', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}
      >
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} HAWT POS. All rights reserved. · Made with ❤️ by Rabia Malik
        </Typography>
      </Box>
    </Box>
  );
}
