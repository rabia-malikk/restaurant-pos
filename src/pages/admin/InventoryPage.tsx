import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { inventoryApi } from '@/api/inventory';
import { useMenu } from '@/hooks/useMenu';
import { useNotify } from '@/context/NotifyContext';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatMoney } from '@/lib/format';

export default function InventoryPage() {
  const inventory = useQuery({
    queryKey: ['inventory'],
    queryFn: inventoryApi.get,
  });
  const menu = useMenu();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [productionPlan, setProductionPlan] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!inventory.data || !menu.data || initialized.current) return;
    const savedPlan = Object.fromEntries(
      inventory.data.production_plan.map((entry) => [entry.menu_item_id, String(entry.quantity)]),
    );
    setProductionPlan(
      Object.fromEntries(
        menu.data.items
          .filter((item) => menu.data.categories.some(
            (category) => category.id === item.category_id && category.is_active,
          ))
          .map((item) => [item.id, savedPlan[item.id] ?? '0']),
      ),
    );
    initialized.current = true;
  }, [inventory.data, menu.data]);

  const addPurchase = useMutation({
    mutationFn: inventoryApi.addPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      notify('Purchase recorded.', 'success');
      setItemName('');
      setQuantity('');
      setUnit('');
      setUnitCost('');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const savePlan = useMutation({
    mutationFn: inventoryApi.saveProductionPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      notify('Tentative production plan saved.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  if (inventory.isLoading || menu.isLoading || !inventory.data || !menu.data) {
    if (inventory.isError || menu.isError) {
      const error = inventory.error ?? menu.error;
      return (
        <Box sx={{ p: 3 }}>
          <Alert severity="error">{error ? errorMessage(error) : 'Could not load inventory data.'}</Alert>
        </Box>
      );
    }
    return (
      <Box sx={{ p: 3 }}>
        <CircularProgress aria-label="Loading inventory" />
      </Box>
    );
  }

  const handleAddPurchase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addPurchase.mutate({
      item_name: itemName.trim(),
      quantity: Number(quantity),
      unit: unit.trim(),
      unit_cost: Number(unitCost),
    });
  };

  const handleSavePlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    savePlan.mutate(
      menu.data.items.filter((item) => menu.data.categories.some(
        (category) => category.id === item.category_id && category.is_active,
      )).map((item) => ({
        menu_item_id: item.id,
        quantity: Number(productionPlan[item.id] ?? 0),
      })),
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto', display: 'grid', gap: 3 }}>
      <Box>
        <Typography variant="h5">Inventory &amp; Procurement</Typography>
        <Typography color="text.secondary">
          Record ingredient purchases and manually set tentative production quantities.
        </Typography>
      </Box>

      <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h6" gutterBottom>Record a purchase</Typography>
        <Box
          component="form"
          onSubmit={handleAddPurchase}
          sx={{
            display: 'grid',
            gap: 2,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr 1fr auto' },
          }}
        >
          <TextField
            label="Ingredient"
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            required
            inputProps={{ maxLength: 120 }}
          />
          <TextField
            label="Quantity"
            type="number"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
            inputProps={{ min: 0.001, step: 'any' }}
          />
          <TextField
            label="Unit"
            placeholder="kg, L, pcs"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            required
            inputProps={{ maxLength: 24 }}
          />
          <TextField
            label="Cost per unit"
            type="number"
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            required
            inputProps={{ min: 0, step: 0.01 }}
          />
          <Button type="submit" variant="contained" disabled={addPurchase.isPending} sx={{ minHeight: 56 }}>
            {addPurchase.isPending ? 'Adding…' : 'Add purchase'}
          </Button>
        </Box>
      </Paper>

      <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h6" gutterBottom>Purchase history</Typography>
        {inventory.data.purchases.length === 0 ? (
          <Typography color="text.secondary">No purchases recorded yet.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ingredient</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Cost per unit</TableCell>
                  <TableCell align="right">Total cost</TableCell>
                  <TableCell>Purchased</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {inventory.data.purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell>{purchase.item_name}</TableCell>
                    <TableCell align="right">{purchase.quantity} {purchase.unit}</TableCell>
                    <TableCell align="right">{formatMoney(purchase.unit_cost)}</TableCell>
                    <TableCell align="right">{formatMoney(purchase.quantity * purchase.unit_cost)}</TableCell>
                    <TableCell>{formatDateTime(purchase.purchased_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Box
          component="form"
          onSubmit={handleSavePlan}
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1 }}
        >
          <Box>
            <Typography variant="h6">Tentative production plan</Typography>
            <Typography variant="body2" color="text.secondary">
              Set planned quantities manually; these are not calculated from ingredient stock.
            </Typography>
          </Box>
          <Button type="submit" variant="contained" disabled={savePlan.isPending}>
            {savePlan.isPending ? 'Saving…' : 'Save plan'}
          </Button>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Menu item</TableCell>
                <TableCell align="right">Tentative quantity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {menu.data.items.filter((item) => menu.data.categories.some(
                (category) => category.id === item.category_id && category.is_active,
              )).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell align="right">
                    <TextField
                      aria-label={`${item.name} tentative production quantity`}
                      type="number"
                      size="small"
                      value={productionPlan[item.id] ?? '0'}
                      onChange={(event) =>
                        setProductionPlan((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      inputProps={{ min: 0, step: 1 }}
                      sx={{ width: 150 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {menu.data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2}>Add menu items before creating a production plan.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
