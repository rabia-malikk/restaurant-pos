import { useState } from 'react';
import { Box, Chip, CircularProgress, IconButton, Paper, Tab, Tabs, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useMenu } from '@/hooks/useMenu';
import { usePosStore } from '@/store/posStore';
import { formatMoney } from '@/lib/format';

/** Category tabs and a grid of items with - / + controls. Changes go to the unsaved cart. */
export default function MenuGrid() {
  const { data, isLoading } = useMenu();
  const cart = usePosStore((s) => s.cart);
  const addItem = usePosStore((s) => s.addItem);
  const removeItem = usePosStore((s) => s.removeItem);
  const [selected, setSelected] = useState<number | null>(null);

  if (isLoading || !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress aria-label="Loading menu" />
      </Box>
    );
  }

  const categories = data.categories
    .filter((category) => category.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const activeCategory = categories.some((category) => category.id === selected)
    ? selected
    : categories[0]?.id ?? false;
  const items = data.items.filter(
    (item) => item.category_id === activeCategory && categories.some((category) => category.id === item.category_id),
  );

  return (
    <Box>
      <Tabs
        value={activeCategory}
        onChange={(_, value: number) => setSelected(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        {categories.map((c) => (
          <Tab key={c.id} value={c.id} label={c.name} />
        ))}
      </Tabs>

      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {items.map((item) => {
          const qty = cart.filter((line) => line.menu_item_id === item.id).length;
          return (
            <Paper
              key={item.id}
              variant="outlined"
              sx={{
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                borderColor: qty > 0 ? 'primary.main' : 'divider',
                boxShadow: (t) => (qty > 0 ? `0 0 0 1px ${t.palette.primary.main}` : 'none'),
                opacity: item.is_available ? 1 : 0.6,
              }}
            >
              {item.image_url && (
                <Box
                  component="img"
                  src={item.image_url}
                  alt={item.name}
                  sx={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 1 }}
                />
              )}
              <Box>
                <Typography fontWeight={700}>{item.name}</Typography>
                <Typography fontWeight={600} color="primary.main">
                  {formatMoney(item.price)}
                </Typography>
                {item.meal_available && (
                  <Typography variant="caption" color="text.secondary">
                    Meal +{formatMoney(item.meal_price)}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  <AccessTimeIcon sx={{ fontSize: 16 }} />
                  {item.prep_time_minutes} min
                </Typography>
              </Box>

              {item.is_available ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
                  <IconButton
                    aria-label={`Remove one ${item.name}`}
                    onClick={() => removeItem(item.id)}
                    disabled={qty === 0}
                    sx={{ border: 1, borderColor: 'divider' }}
                  >
                    <RemoveIcon />
                  </IconButton>
                  <Typography fontWeight={700} sx={{ minWidth: 24, textAlign: 'center' }} aria-live="polite">
                    {qty}
                  </Typography>
                  <IconButton
                    aria-label={`Add one ${item.name}`}
                    onClick={() => addItem(item.id)}
                    sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}
                  >
                    <AddIcon />
                  </IconButton>
                </Box>
              ) : (
                <Chip label="Sold out" size="small" sx={{ alignSelf: 'flex-start', mt: 'auto' }} />
              )}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
