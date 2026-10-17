import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem as SelectItem,
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
  Typography,
} from '@mui/material';
import { menuApi } from '@/api/menu';
import type { MenuItem } from '@/types';
import { useNotify } from '@/context/NotifyContext';
import { useMenu } from '@/hooks/useMenu';
import { errorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default function MenuPage() {
  const { data, isLoading } = useMenu();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    if (!imageFile) return undefined;
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const toggle = useMutation({
    mutationFn: ({ id, available }: { id: number; available: boolean }) => menuApi.setAvailability(id, available),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu'] }),
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const saveItem = useMutation({
    mutationFn: ({ id, payload }: {
      id?: number;
      payload: {
        category_id: number;
        name: string;
        description?: string;
        price: number;
        prep_time_minutes: number;
        image?: File;
      };
    }) => (id === undefined ? menuApi.create(payload) : menuApi.update(id, payload)),
    onSuccess: (_item, variables) => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      notify(variables.id === undefined ? 'Menu item added.' : 'Menu item updated.', 'success');
      closeDialog();
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const resetFields = () => {
    setEditingItem(null);
    setCategoryId('');
    setName('');
    setDescription('');
    setPrice('');
    setPrepTime('');
    setImageFile(null);
    setImagePreview('');
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetFields();
  };

  const openAddDialog = () => {
    resetFields();
    setDialogOpen(true);
  };

  const openEditDialog = (item: MenuItem) => {
    setEditingItem(item);
    setCategoryId(item.category_id);
    setName(item.name);
    setDescription(item.description ?? '');
    setPrice(String(item.price));
    setPrepTime(String(item.prep_time_minutes));
    setImageFile(null);
    setImagePreview(item.image_url ?? '');
    setDialogOpen(true);
  };

  const selectImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('Choose an image file.', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      notify('Image must be 5 MB or smaller.', 'error');
      return;
    }
    setImageFile(file);
  };

  if (isLoading || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <CircularProgress aria-label="Loading menu" />
      </Box>
    );
  }

  const categoryName = (id: number) => data.categories.find((category) => category.id === id)?.name ?? '';

  const handleSaveItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (categoryId === '') return;
    saveItem.mutate({
      id: editingItem?.id,
      payload: {
        category_id: categoryId,
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        prep_time_minutes: Number(prepTime),
        image: imageFile ?? undefined,
      },
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Menu</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAddDialog}
          disabled={data.categories.length === 0}
        >
          Add item
        </Button>
      </Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Image</TableCell>
              <TableCell>Item</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Prep time</TableCell>
              <TableCell align="center">Available</TableCell>
              <TableCell align="center">Edit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>
                  {item.image_url ? (
                    <Box
                      component="img"
                      src={item.image_url}
                      alt={item.name}
                      sx={{ width: 56, height: 44, objectFit: 'cover', borderRadius: 1, display: 'block' }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">No image</Typography>
                  )}
                </TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{categoryName(item.category_id)}</TableCell>
                <TableCell align="right">{formatMoney(item.price)}</TableCell>
                <TableCell align="right">{item.prep_time_minutes} min</TableCell>
                <TableCell align="center">
                  <Switch
                    checked={item.is_available}
                    onChange={(_, checked) => toggle.mutate({ id: item.id, available: checked })}
                    inputProps={{ 'aria-label': `${item.name} available` }}
                  />
                </TableCell>
                <TableCell align="center">
                  <IconButton aria-label={`Edit ${item.name}`} onClick={() => openEditDialog(item)}>
                    <EditIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={dialogOpen} onClose={saveItem.isPending ? undefined : closeDialog} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={handleSaveItem}>
          <DialogTitle>{editingItem ? 'Edit menu item' : 'Add menu item'}</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
            <Button
              component="label"
              variant="outlined"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) selectImage(file);
              }}
              sx={{
                minHeight: 150,
                borderStyle: 'dashed',
                display: 'grid',
                gap: 1,
                textTransform: 'none',
              }}
            >
              {imagePreview ? (
                <Box
                  component="img"
                  src={imagePreview}
                  alt="Menu item preview"
                  sx={{ maxWidth: '100%', maxHeight: 170, objectFit: 'contain' }}
                />
              ) : (
                <Typography>Drag and drop an image here, or click to browse</Typography>
              )}
              <Typography variant="caption" color="text.secondary">Image files up to 5 MB</Typography>
              <input
                hidden
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) selectImage(file);
                  event.target.value = '';
                }}
              />
            </Button>
            <TextField
              label="Item name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
              inputProps={{ maxLength: 120 }}
            />
            <FormControl required>
              <InputLabel id="menu-item-category-label">Category</InputLabel>
              <Select
                labelId="menu-item-category-label"
                value={categoryId}
                label="Category"
                onChange={(event) => setCategoryId(Number(event.target.value))}
              >
                {data.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
            />
            <TextField
              label="Price"
              type="number"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
              inputProps={{ min: 0.01, step: 0.01 }}
            />
            <TextField
              label="Prep time (minutes)"
              type="number"
              value={prepTime}
              onChange={(event) => setPrepTime(event.target.value)}
              required
              inputProps={{ min: 0, step: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeDialog} disabled={saveItem.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saveItem.isPending || categoryId === ''}>
              {saveItem.isPending ? 'Saving…' : editingItem ? 'Save changes' : 'Add item'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
