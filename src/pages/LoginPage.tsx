import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { ApiError, errorMessage } from '@/lib/errors';

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sessionConflict, setSessionConflict] = useState<FormValues | null>(null);
  const [takingOver, setTakingOver] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  if (status !== 'loading' && user) return <Navigate to="/pos" replace />;

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values.username, values.password);
      navigate('/pos', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SESSION_EXISTS') {
        setSessionConflict(values);
        return;
      }
      setServerError(errorMessage(error));
    }
  };

  const confirmSessionTakeover = async () => {
    if (!sessionConflict) return;
    setTakingOver(true);
    setServerError(null);
    try {
      await login(sessionConflict.username, sessionConflict.password, true);
      setSessionConflict(null);
      navigate('/pos', { replace: true });
    } catch (error) {
      setSessionConflict(null);
      setServerError(errorMessage(error));
    } finally {
      setTakingOver(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '5fr 4fr' },
        gridTemplateRows: '1fr auto',
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'flex-end',
          p: 6,
          bgcolor: '#b50809',
          color: 'primary.contrastText',
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 700, maxWidth: 420, lineHeight: 1.1, color: '#000000' }}>
          Take the order. Keep the kitchen moving.
        </Typography>
        <Typography sx={{ mt: 2, maxWidth: 420, opacity: 0.8 }}>
          Sign in to open tables, add rounds as guests order more, and check out when they are done.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', placeItems: 'center', p: 3 }}>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ width: '100%', maxWidth: 360 }}>
          <Box
            component="img"
            src="/hawt.png"
            alt="HAWT"
            sx={{ display: 'block', width: 176, height: 'auto', mb: 3, mx: 'auto' }}
          />
          <Typography variant="h5" gutterBottom>
            Sign in
          </Typography>

          {serverError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError}
            </Alert>
          )}

          <TextField
            label="Username"
            fullWidth
            margin="normal"
            autoComplete="username"
            autoFocus
            error={!!errors.username}
            helperText={errors.username?.message}
            {...register('username')}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            autoComplete="current-password"
            error={!!errors.password}
            helperText={errors.password?.message}
            {...register('password')}
          />

          <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting} sx={{ mt: 2 }}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>

        </Box>
      </Box>
      <Box component="footer" sx={{ gridColumn: '1 / -1', py: 1.5, px: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} HAWT POS. All rights reserved. · Made with ❤️ by Rabia Malik
        </Typography>
      </Box>
      <Dialog
        open={sessionConflict !== null}
        onClose={() => !takingOver && setSessionConflict(null)}
        aria-labelledby="session-conflict-title"
      >
        <DialogTitle id="session-conflict-title">Account already signed in</DialogTitle>
        <DialogContent>
          <Typography>
            This account is active in another session. Sign in here and log out the other session?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSessionConflict(null)} disabled={takingOver}>
            Stay signed out
          </Button>
          <Button onClick={confirmSessionTakeover} variant="contained" disabled={takingOver}>
            {takingOver ? 'Signing in…' : 'Log out other session'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
