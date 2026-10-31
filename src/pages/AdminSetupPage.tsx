import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/lib/errors';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the admin name.').max(100, 'Name must be at most 100 characters.'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter a username.')
    .max(50, 'Username must be at most 50 characters.')
    .regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, numbers, dots, underscores, or hyphens.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200, 'Password is too long.'),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

type FormValues = z.infer<typeof schema>;

export default function AdminSetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', username: '', password: '', confirmPassword: '' },
  });

  const setup = useMutation({
    mutationFn: authApi.createInitialAdmin,
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'admin-setup-status'], { adminExists: true });
      setServerError(null);
      navigate('/login', { replace: true });
    },
    onError: (error) => setServerError(errorMessage(error)),
  });

  const onSubmit = ({ confirmPassword: _confirmPassword, ...values }: FormValues) => {
    setServerError(null);
    setup.mutate(values);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ width: '100%', maxWidth: 420 }}>
        <Box
          component="img"
          src="/hawt.png"
          alt="HAWT"
          sx={{ display: 'block', width: 176, height: 'auto', mb: 3, mx: 'auto' }}
        />
        <Typography variant="h5" gutterBottom>Create administrator account</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          No admin account exists yet. Create the first account to set up HAWT POS.
        </Typography>
        {serverError && <Alert severity="error" sx={{ mb: 2 }}>{serverError}</Alert>}
        <TextField
          label="Admin name"
          fullWidth
          margin="normal"
          autoComplete="name"
          autoFocus
          inputProps={{ maxLength: 100 }}
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Username"
          fullWidth
          margin="normal"
          autoComplete="username"
          inputProps={{ maxLength: 50 }}
          error={Boolean(errors.username)}
          helperText={errors.username?.message}
          {...register('username')}
        />
        <TextField
          label="Password"
          type="password"
          fullWidth
          margin="normal"
          autoComplete="new-password"
          error={Boolean(errors.password)}
          helperText={errors.password?.message ?? 'Use at least 8 characters.'}
          {...register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          fullWidth
          margin="normal"
          autoComplete="new-password"
          error={Boolean(errors.confirmPassword)}
          helperText={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={setup.isPending} sx={{ mt: 2 }}>
          {setup.isPending ? 'Creating account…' : 'Create admin account'}
        </Button>
      </Box>
    </Box>
  );
}
