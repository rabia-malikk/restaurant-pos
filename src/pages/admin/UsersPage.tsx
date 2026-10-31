import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Checkbox,
  Tooltip,
  Typography,
} from '@mui/material';
import { usersApi } from '@/api/users';
import { useNotify } from '@/context/NotifyContext';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { CreateUserPayload, Role, UpdateUserPayload, User, UserFeature } from '@/types';

type SaveUserVariables =
  | { id: null; payload: CreateUserPayload }
  | { id: number; payload: UpdateUserPayload };

export default function UsersPage() {
  const currentUser = useAuthStore((state) => state.user);
  const notify = useNotify();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const capacity = useQuery({ queryKey: ['users', 'capacity'], queryFn: usersApi.capacity });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [features, setFeatures] = useState<UserFeature[]>([]);
  const [isActive, setIsActive] = useState(true);

  const refreshUsers = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['users', 'capacity'] });
  };

  const saveUser = useMutation({
    mutationFn: ({ id, payload }: SaveUserVariables) =>
      id === null ? usersApi.create(payload) : usersApi.update(id, payload),
    onSuccess: (_user, variables) => {
      refreshUsers();
      notify(variables.id === null ? 'User created.' : 'User updated.', 'success');
      setDialogOpen(false);
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const setUserActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersApi.update(id, { is_active }),
    onSuccess: refreshUsers,
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const deleteUser = useMutation({
    mutationFn: usersApi.delete,
    onSuccess: () => {
      refreshUsers();
      notify('User deleted.', 'success');
      setDeletingUser(null);
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const resetFields = () => {
    setEditingUser(null);
    setName('');
    setUsername('');
    setPassword('');
    setRole('staff');
    setFeatures([]);
    setIsActive(true);
  };

  const openCreateDialog = () => {
    resetFields();
    setDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setName(user.name);
    setUsername(user.username);
    setPassword('');
    setRole(user.role);
    setFeatures(user.features);
    setIsActive(user.is_active);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saveUser.isPending) return;
    setDialogOpen(false);
    resetFields();
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = {
      name: name.trim(),
      username: username.trim(),
      role,
      is_active: isActive,
      features: role === 'staff' ? features : [],
    };
    if (!fields.name || !fields.username) {
      notify('Name and username are required.', 'error');
      return;
    }
    if (editingUser) {
      const payload: UpdateUserPayload = {
        ...fields,
        ...(password ? { password } : {}),
      };
      saveUser.mutate({ id: editingUser.id, payload });
    } else {
      saveUser.mutate({ id: null, payload: { ...fields, password } });
    }
  };

  const roleHasCapacity = (targetRole: Role) => {
    const active = targetRole === 'admin' ? capacity.data?.active_admins : capacity.data?.active_staff;
    const maximum = targetRole === 'admin' ? capacity.data?.max_admins : capacity.data?.max_staff;
    return maximum === -1 || (active !== undefined && maximum !== undefined && active < maximum);
  };

  if (users.isLoading || capacity.isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <CircularProgress aria-label="Loading users" />
      </Box>
    );
  }

  if (users.isError || capacity.isError || !users.data || !capacity.data) {
    const error = users.error ?? capacity.error;
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {error ? errorMessage(error) : 'Could not load users and user capacity.'}
        </Alert>
      </Box>
    );
  }

  const canCreateUser = roleHasCapacity(role);
  const toggleFeature = (feature: UserFeature, checked: boolean) => {
    setFeatures((current) =>
      checked ? [...current, feature] : current.filter((value) => value !== feature),
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h5">Users</Typography>
          <Typography color="text.secondary">
            Active users: {capacity.data.active_users} / {capacity.data.max_users === -1 ? 'Unlimited' : capacity.data.max_users}
            {' · '}Admins: {capacity.data.active_admins} / {capacity.data.max_admins === -1 ? 'Unlimited' : capacity.data.max_admins}
            {' · '}Staff: {capacity.data.active_staff} / {capacity.data.max_staff === -1 ? 'Unlimited' : capacity.data.max_staff}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateDialog}
          disabled={!canCreateUser}
        >
          Add user
        </Button>
      </Box>
      {!canCreateUser && (
        <Alert severity="info" sx={{ mb: 2 }}>
          The allowed number of active {role} users has been reached. Choose another role or increase the limit in the database.
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.data.map((user) => {
              const isCurrentUser = user.id === currentUser?.id;
              return (
                <TableRow key={user.id} hover>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.role === 'admin' ? 'Admin' : 'Staff'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        size="small"
                        label={user.is_active ? 'Active' : 'Disabled'}
                        color={user.is_active ? 'success' : 'default'}
                      />
                      <Switch
                        size="small"
                        checked={user.is_active}
                        disabled={isCurrentUser || setUserActive.isPending}
                        onChange={(_, checked) => setUserActive.mutate({ id: user.id, is_active: checked })}
                        inputProps={{ 'aria-label': `Set ${user.name} ${user.is_active ? 'inactive' : 'active'}` }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton aria-label={`Edit ${user.name}`} onClick={() => openEditDialog(user)}>
                      <EditIcon />
                    </IconButton>
                    <Tooltip title={isCurrentUser ? 'You cannot delete your own account.' : 'Delete user'}>
                      <span>
                        <IconButton
                          aria-label={`Delete ${user.name}`}
                          color="error"
                          disabled={isCurrentUser}
                          onClick={() => setDeletingUser(user)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={handleSave}>
          <DialogTitle>{editingUser ? 'Edit user' : 'Add user'}</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
              inputProps={{ maxLength: 120 }}
            />
            <TextField
              label="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              inputProps={{ maxLength: 50 }}
            />
            <TextField
              label={editingUser ? 'New password (optional)' : 'Password'}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!editingUser}
              autoComplete="new-password"
            />
            <FormControl>
              <InputLabel id="user-role-label">Role</InputLabel>
              <Select
                labelId="user-role-label"
                value={role}
                label="Role"
                disabled={editingUser?.id === currentUser?.id}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <MenuItem value="staff" disabled={editingUser?.role !== 'staff' && !roleHasCapacity('staff')}>
                  Staff
                </MenuItem>
                <MenuItem value="admin" disabled={editingUser?.role !== 'admin' && !roleHasCapacity('admin')}>
                  Admin
                </MenuItem>
              </Select>
            </FormControl>
            {role === 'staff' && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Features available to this staff user</Typography>
                <FormGroup>
                  {([
                    ['orders', 'Orders'],
                    ['menu', 'Menu'],
                    ['kitchen', 'Kitchen'],
                  ] as const).map(([feature, label]) => (
                    <FormControlLabel
                      key={feature}
                      control={
                        <Checkbox
                          checked={features.includes(feature)}
                          onChange={(_, checked) => toggleFeature(feature, checked)}
                        />
                      }
                      label={label}
                    />
                  ))}
                </FormGroup>
              </Box>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(_, checked) => setIsActive(checked)}
                  disabled={
                    editingUser?.id === currentUser?.id ||
                    (!isActive && editingUser?.is_active === false && !roleHasCapacity(role))
                  }
                />
              }
              label="Active"
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeDialog} disabled={saveUser.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saveUser.isPending}>
              {saveUser.isPending ? 'Saving…' : editingUser ? 'Save changes' : 'Create user'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={deletingUser !== null} onClose={() => !deleteUser.isPending && setDeletingUser(null)}>
        <DialogTitle>Delete user?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete {deletingUser?.name}? They will no longer be able to sign in.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeletingUser(null)} disabled={deleteUser.isPending}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteUser.isPending}
            onClick={() => deletingUser && deleteUser.mutate(deletingUser.id)}
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
