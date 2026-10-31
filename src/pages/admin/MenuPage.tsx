import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CategoryIcon from '@mui/icons-material/Category';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RemoveIcon from '@mui/icons-material/Remove';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
import type { Category, MenuItem } from '@/types';
import { useNotify } from '@/context/NotifyContext';
import { useMenu } from '@/hooks/useMenu';
import { errorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default function MenuPage() {
  const { data, isLoading, isError, error } = useMenu();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [archivingCategory, setArchivingCategory] = useState<Category | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryNameValue, setCategoryNameValue] = useState('');
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  const categorySectionRef = useRef<HTMLDivElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [mealAvailable, setMealAvailable] = useState(false);
  const [mealPrice, setMealPrice] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    if (!imageFile) return undefined;
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  useEffect(() => {
    if (!categoriesExpanded) return undefined;
    const collapseOnOutsideClick = (event: PointerEvent) => {
      if (!categorySectionRef.current?.contains(event.target as Node)) {
        setCategoriesExpanded(false);
      }
    };
    document.addEventListener('pointerdown', collapseOnOutsideClick);
    return () => document.removeEventListener('pointerdown', collapseOnOutsideClick);
  }, [categoriesExpanded]);

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
        meal_available: boolean;
        meal_price: number;
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

  const deleteItem = useMutation({
    mutationFn: (item: MenuItem) => menuApi.remove(item.id),
    onSuccess: (_result, item) => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setDeletingItem(null);
      notify(`${item.name} removed from the active menu.`, 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const saveCategory = useMutation({
    mutationFn: () =>
      editingCategory
        ? menuApi.updateCategory(editingCategory.id, categoryNameValue)
        : menuApi.createCategory(categoryNameValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryNameValue('');
      notify(editingCategory ? 'Category updated.' : 'Category added.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const toggleCategory = useMutation({
    mutationFn: ({ category, isActive }: { category: Category; isActive: boolean }) =>
      menuApi.setCategoryActive(category.id, isActive),
    onSuccess: (_updated, variables) => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      notify(variables.isActive ? 'Category enabled.' : 'Category disabled; its items are unavailable.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const deleteCategory = useMutation({
    mutationFn: (category: Category) => menuApi.removeCategory(category.id),
    onSuccess: (_result, category) => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setArchivingCategory(null);
      notify(`${category.name} archived. Its items are unavailable until the category is restored.`, 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const resetFields = () => {
    setEditingItem(null);
    setCategoryId('');
    setName('');
    setDescription('');
    setPrice('');
    setMealAvailable(false);
    setMealPrice('');
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
    setMealAvailable(item.meal_available);
    setMealPrice(String(item.meal_price));
    setPrepTime(String(item.prep_time_minutes));
    setImageFile(null);
    setImagePreview(item.image_url ?? '');
    setDialogOpen(true);
  };

  const openAddCategory = () => {
    setEditingCategory(null);
    setCategoryNameValue('');
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryNameValue(category.name);
    setCategoryDialogOpen(true);
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

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <CircularProgress aria-label="Loading menu" />
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {error ? errorMessage(error) : 'Could not load menu items from the database.'}
        </Alert>
      </Box>
    );
  }

  const categoryForItem = (id: number) => data.categories.find((category) => category.id === id);
  const categoryName = (id: number) => categoryForItem(id)?.name ?? '';
  const activeCategoryCount = data.categories.filter((category) => category.is_active).length;

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
        meal_available: mealAvailable,
        meal_price: mealAvailable ? Number(mealPrice) : 0,
        prep_time_minutes: Number(prepTime),
        image: imageFile ?? undefined,
      },
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto', display: 'grid', gap: 3 }}>
      <Typography variant="h5">Menu &amp; categories</Typography>
      <Paper ref={categorySectionRef} variant="outlined">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, p: 2 }}>
          <Box>
            <Typography variant="h6">Categories</Typography>
            <Typography variant="body2" color="text.secondary">
              Disabled or archived categories and their items are hidden from the POS.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button variant="contained" startIcon={<CategoryIcon />} onClick={openAddCategory}>
              Add category
            </Button>
            <IconButton
              aria-label={categoriesExpanded ? 'Minimize categories' : 'Expand categories'}
              title={categoriesExpanded ? 'Minimize categories' : 'Expand categories'}
              onClick={() => setCategoriesExpanded((expanded) => !expanded)}
            >
              {categoriesExpanded ? <RemoveIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
        </Box>
        {categoriesExpanded && <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell align="right">Items</TableCell>
                <TableCell align="center">Enabled</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.categories.map((category) => (
                <TableRow key={category.id} hover sx={{ opacity: category.is_active ? 1 : 0.65 }}>
                  <TableCell>{category.name}</TableCell>
                  <TableCell align="right">
                    {data.items.filter((item) => item.category_id === category.id).length}
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={category.is_active}
                      onChange={(_, checked) => toggleCategory.mutate({ category, isActive: checked })}
                      disabled={toggleCategory.isPending}
                      inputProps={{ 'aria-label': `Enable ${category.name} category` }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton aria-label={`Edit ${category.name}`} onClick={() => openEditCategory(category)}>
                      <EditIcon />
                    </IconButton>
                    {category.is_active && (
                      <IconButton
                        aria-label={`Delete ${category.name} category`}
                        color="error"
                        onClick={() => setArchivingCategory(category)}
                        disabled={deleteCategory.isPending}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary">No categories yet. Add one to start building the menu.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>}
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography variant="h6">Menu items</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAddDialog} disabled={activeCategoryCount === 0}>
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
              <TableCell align="right">Meal add-on</TableCell>
              <TableCell align="right">Prep time</TableCell>
              <TableCell align="center">Available</TableCell>
              <TableCell align="center">Actions</TableCell>
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
                <TableCell>
                  {categoryName(item.category_id)}
                  {!categoryForItem(item.category_id)?.is_active && (
                    <Typography component="span" variant="caption" color="error.main"> (disabled)</Typography>
                  )}
                </TableCell>
                <TableCell align="right">{formatMoney(item.price)}</TableCell>
                <TableCell align="right">
                  {item.meal_available ? `+${formatMoney(item.meal_price)}` : '—'}
                </TableCell>
                <TableCell align="right">{item.prep_time_minutes} min</TableCell>
                <TableCell align="center">
                  <Switch
                    checked={item.is_available}
                    onChange={(_, checked) => toggle.mutate({ id: item.id, available: checked })}
                    disabled={!categoryForItem(item.category_id)?.is_active || toggle.isPending}
                    inputProps={{
                      'aria-label': `${item.name} available`,
                      title: categoryForItem(item.category_id)?.is_active
                        ? undefined
                        : 'Enable this item by enabling its category or moving it to an active category.',
                    }}
                  />
                </TableCell>
                <TableCell align="center">
                  <IconButton aria-label={`Edit ${item.name}`} onClick={() => openEditDialog(item)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    aria-label={`Delete ${item.name}`}
                    color="error"
                    onClick={() => setDeletingItem(item)}
                    disabled={deleteItem.isPending}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={deletingItem !== null} onClose={deleteItem.isPending ? undefined : () => setDeletingItem(null)}>
        <DialogTitle>Remove menu item?</DialogTitle>
        <DialogContent>
          <Typography>
            {deletingItem?.name} will be removed from the active menu. Existing order history will be retained.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeletingItem(null)} disabled={deleteItem.isPending}>
            Keep item
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deletingItem && deleteItem.mutate(deletingItem)}
            disabled={deleteItem.isPending}
          >
            {deleteItem.isPending ? 'Removing…' : 'Remove item'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={categoryDialogOpen}
        onClose={saveCategory.isPending ? undefined : () => setCategoryDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <Box
          component="form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            saveCategory.mutate();
          }}
        >
          <DialogTitle>{editingCategory ? 'Edit category' : 'Add category'}</DialogTitle>
          <DialogContent sx={{ pt: '8px !important' }}>
            <TextField
              label="Category name"
              value={categoryNameValue}
              onChange={(event) => setCategoryNameValue(event.target.value)}
              required
              fullWidth
              autoFocus
              inputProps={{ maxLength: 100 }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setCategoryDialogOpen(false)} disabled={saveCategory.isPending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saveCategory.isPending}>
              {saveCategory.isPending ? 'Saving…' : editingCategory ? 'Save changes' : 'Add category'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog
        open={archivingCategory !== null}
        onClose={deleteCategory.isPending ? undefined : () => setArchivingCategory(null)}
      >
        <DialogTitle>Delete category?</DialogTitle>
        <DialogContent>
          <Typography>
            {archivingCategory?.name} and its items will be removed from the active menu. Existing item and order
            history will be retained, and you can restore the category later.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setArchivingCategory(null)} disabled={deleteCategory.isPending}>Keep category</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => archivingCategory && deleteCategory.mutate(archivingCategory)}
            disabled={deleteCategory.isPending}
          >
            {deleteCategory.isPending ? 'Deleting…' : 'Delete category'}
          </Button>
        </DialogActions>
      </Dialog>
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
                  <SelectItem key={category.id} value={category.id} disabled={!category.is_active}>
                    {category.is_active ? category.name : `${category.name} (disabled)`}
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
            <FormControlLabel
              control={
                <Checkbox
                  checked={mealAvailable}
                  onChange={(event) => setMealAvailable(event.target.checked)}
                />
              }
              label="Make it a meal"
            />
            {mealAvailable && (
              <TextField
                label="Meal add-on price"
                type="number"
                value={mealPrice}
                onChange={(event) => setMealPrice(event.target.value)}
                required
                inputProps={{ min: 0, step: 0.01 }}
                helperText="This amount is added to the menu item price."
              />
            )}
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
            <Button
              type="submit"
              variant="contained"
              disabled={
                saveItem.isPending ||
                categoryId === '' ||
                !data.categories.find((category) => category.id === categoryId)?.is_active
              }
            >
              {saveItem.isPending ? 'Saving…' : editingItem ? 'Save changes' : 'Add item'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
