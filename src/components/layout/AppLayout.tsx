import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Alert, AppBar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Toolbar, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shiftsApi } from '@/api/shifts';
import { useNotify } from '@/context/NotifyContext';
import { errorMessage } from '@/lib/errors';
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
  const notify = useNotify();
  const queryClient = useQueryClient();
  useSocket();
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const shiftQueryKey = ['shifts', 'me', user?.id] as const;
  const shiftQuery = useQuery({
    queryKey: shiftQueryKey,
    queryFn: shiftsApi.current,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  const activeShift = shiftQuery.data?.active_shift ?? null;

  const startShiftMutation = useMutation({
    mutationFn: shiftsApi.start,
    onSuccess: async (status) => {
      queryClient.setQueryData(shiftQueryKey, status);
      await queryClient.invalidateQueries({ queryKey: ['shifts', 'me'] });
      setStartDialogOpen(false);
      notify('Shift started.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const endShiftMutation = useMutation({
    mutationFn: shiftsApi.end,
    onSuccess: async ({ ended }) => {
      await queryClient.invalidateQueries({ queryKey: ['shifts', 'me'] });
      notify(user?.role === 'admin' ? `Shift ended for ${ended} user(s).` : 'Shift ended.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  useEffect(() => {
    if (!user || !shiftQuery.data || shiftQuery.isError) return;
    if (activeShift) {
      setStartDialogOpen(false);
      return;
    }
    const key = `hawt-pos-shift-prompt:${user.id}:${shiftQuery.data.business_date}`;
    if (window.localStorage.getItem(key) !== 'shown') {
      window.localStorage.setItem(key, 'shown');
      setStartDialogOpen(true);
    }
  }, [activeShift, shiftQuery.data, shiftQuery.isError, user]);

  useEffect(() => {
    if (!activeShift) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [activeShift]);

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
          {user.role === 'admin' ? (
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
          ) : (
            <>
              {user.features.includes('orders') && (
                <Button component={NavLink} to="/admin/orders" sx={navButtonSx}>
                  Orders
                </Button>
              )}
              {user.features.includes('menu') && (
                <Button component={NavLink} to="/admin/menu" sx={navButtonSx}>
                  Menu
                </Button>
              )}
              {user.features.includes('kitchen') && (
                <Button component={NavLink} to="/admin/kitchen" sx={navButtonSx}>
                  Kitchen
                </Button>
              )}
            </>
          )}

          <Box sx={{ flex: 1 }} />
          <Chip
            label={`${user.name} (${user.role === 'admin' ? 'Admin' : 'Staff'})`}
            sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: 'inherit' }}
          />
          {activeShift && (
            <Chip
              label={formatShiftElapsed(activeShift.started_at, now)}
              size="small"
              aria-label="Time spent on shift"
              sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: 'inherit' }}
            />
          )}
          <Button
            color="inherit"
            variant="outlined"
            disabled={shiftQuery.isLoading || startShiftMutation.isPending || endShiftMutation.isPending}
            onClick={() => {
              if (!activeShift) {
                startShiftMutation.mutate();
                return;
              }
              if (user.role === 'admin' && !window.confirm('Ending your shift will end every active user shift. Continue?')) {
                return;
              }
              endShiftMutation.mutate();
            }}
          >
            {activeShift ? 'End shift' : 'Start shift'}
          </Button>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

      {shiftQuery.isError && (
        <Alert severity="error">{errorMessage(shiftQuery.error)}</Alert>
      )}
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

      <Dialog open={startDialogOpen} onClose={() => setStartDialogOpen(false)} aria-labelledby="start-shift-title">
        <DialogTitle id="start-shift-title">Start your shift?</DialogTitle>
        <DialogContent>
          <Typography>
            Start your shift before creating or processing orders. Any active shift ends automatically at 5:00 AM
            {shiftQuery.data?.timezone ? ` (${shiftQuery.data.timezone})` : ''}.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStartDialogOpen(false)}>Not now</Button>
          <Button
            variant="contained"
            onClick={() => startShiftMutation.mutate()}
            disabled={startShiftMutation.isPending}
          >
            Start shift
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function formatShiftElapsed(startedAt: string, now: number): string {
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return 'Time unavailable';
  const totalMinutes = Math.max(0, Math.floor((now - started) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
}
