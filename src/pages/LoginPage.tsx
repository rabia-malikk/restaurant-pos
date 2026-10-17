import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { USE_MOCK } from '@/config';
import { errorMessage } from '@/lib/errors';

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
      setServerError(errorMessage(error));
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 4fr' } }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'flex-end',
          p: 6,
          bgcolor: 'primary.dark',
          color: 'primary.contrastText',
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 700, maxWidth: 420, lineHeight: 1.1 }}>
          Take the order. Keep the kitchen moving.
        </Typography>
        <Typography sx={{ mt: 2, maxWidth: 420, opacity: 0.8 }}>
          Sign in to open tables, add rounds as guests order more, and check out when they are done.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', placeItems: 'center', p: 3 }}>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ width: '100%', maxWidth: 360 }}>
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

          {USE_MOCK && (
            <Alert severity="info" sx={{ mt: 3 }}>
              Demo mode. Admin: <b>admin</b> / <b>admin123</b>. Staff: <b>ayesha</b> or <b>bilal</b> / <b>staff123</b>.
            </Alert>
          )}
        </Box>
      </Box>
    </Box>
  );
}
