import {
  Box,
  Button,
  Chip,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useMenu } from '@/hooks/useMenu';
import { usePosStore } from '@/store/posStore';
import { formatMoney, formatTime, STATUS_LABEL } from '@/lib/format';
import { cartLineCount, cartPrepMinutes, cartSubtotal, computeTotals } from '@/lib/orderRules';
import type { DiscountType } from '@/types';

interface Props {
  saving: boolean;
  onSave: () => void;
  onCheckout: () => void;
  onCancel: () => void;
  onRemoveSavedItem: (itemId: number, itemName: string) => void;
  removingSavedItem: boolean;
}

/** Right panel: saved rounds, the unsaved cart, totals, and the Save / Checkout actions. */
export default function OrderSummary({
  saving,
  onSave,
  onCheckout,
  onCancel,
  onRemoveSavedItem,
  removingSavedItem,
}: Props) {
  const order = usePosStore((s) => s.order);
  const cart = usePosStore((s) => s.cart);
  const removeItem = usePosStore((s) => s.removeItem);
  const updateCartLine = usePosStore((s) => s.updateCartLine);
  const setDiscount = usePosStore((s) => s.setDiscount);
  const { data: menu } = useMenu();

  if (!order) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Order summary
        </Typography>
        <Typography color="text.secondary">Open an order to see its items here.</Typography>
      </Box>
    );
  }

  const menuItems = menu?.items ?? [];
  const roundsWithItems = order.rounds.filter((round) => round.items.length > 0);
  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const cartLines = cart.flatMap((line) => {
    const item = menuById.get(line.menu_item_id);
    return item ? [{ line, item }] : [];
  });
  const hasCart = cart.length > 0;
  const totals = computeTotals(order, cartSubtotal(cart, menuItems));
  const prepMinutes = cartPrepMinutes(cart, menuItems);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography variant="h6">Order summary</Typography>
          <Typography variant="body2" color="text.secondary">
            {order.order_no}
          </Typography>
        </Box>
        <Chip label={STATUS_LABEL[order.status]} size="small" />
      </Box>
      <Divider />

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {roundsWithItems.length === 0 && !hasCart && (
          <Typography color="text.secondary">No items yet. Add items from the menu.</Typography>
        )}

        {roundsWithItems.map((round) => (
          <Box key={round.id}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography fontWeight={700}>Round {round.round_no}</Typography>
              <Typography variant="body2" color="text.secondary">
                ready about {formatTime(round.estimated_ready_at)}
              </Typography>
            </Box>
            {round.items.map((item) => (
              <Box key={item.id} sx={{ py: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box>
                    <Typography variant="body2">
                      {item.quantity} × {item.item_name}{item.is_meal ? ' (Meal)' : ''}
                    </Typography>
                    {item.remarks && (
                      <Typography variant="caption" color="text.secondary">{item.remarks}</Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2">{formatMoney(item.line_total)}</Typography>
                    {round.status !== 'served' && (
                      <Tooltip title={`Remove ${item.item_name} from this saved order`}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Remove saved ${item.item_name}`}
                            onClick={() => onRemoveSavedItem(item.id, item.item_name)}
                            disabled={removingSavedItem || saving}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        ))}

        {hasCart && (
          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(232, 163, 61, 0.14)' }}>
            <Typography fontWeight={700}>New items, not saved yet</Typography>
            {cartLines.map(({ line, item }) => (
              <Box key={line.key} sx={{ display: 'grid', gap: 0.5, py: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2">1 × {item.name}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="body2">
                      {formatMoney(item.price + (line.is_meal ? item.meal_price : 0))}
                    </Typography>
                    <IconButton size="small" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.id)}>
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                {item.meal_available && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={line.is_meal}
                        onChange={(event) => updateCartLine(line.key, { is_meal: event.target.checked })}
                      />
                    }
                    label={`Make it a meal (+${formatMoney(item.meal_price)})`}
                    sx={{ ml: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                  />
                )}
                <TextField
                  size="small"
                  label="Remarks"
                  value={line.remarks}
                  onChange={(event) => updateCartLine(line.key, { remarks: event.target.value })}
                  inputProps={{ maxLength: 500 }}
                />
              </Box>
            ))}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {cartLineCount(cart)} items, kitchen time about {prepMinutes} min
            </Typography>
          </Box>
        )}
      </Box>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 1, mt: 1 }}>
          <FormControl size="small">
            <InputLabel id="discount-type-label">Discount type</InputLabel>
            <Select<DiscountType>
              labelId="discount-type-label"
              label="Discount type"
              value={order.discount_type ?? 'amount'}
              onChange={(event) => {
                const type = event.target.value === 'percentage' ? 'percentage' : 'amount';
                setDiscount(type, order.discount_value ?? order.discount ?? 0);
              }}
            >
              <MenuItem value="percentage">Percentage (%)</MenuItem>
              <MenuItem value="amount">Amount</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="number"
            label={order.discount_type === 'percentage' ? 'Discount (%)' : 'Discount amount'}
            value={order.discount_value ? order.discount_value : ''}
            inputProps={{ min: 0, max: order.discount_type === 'percentage' ? 100 : undefined, step: 0.01 }}
            onChange={(event) => {
              const value = Math.max(0, Number(event.target.value) || 0);
              setDiscount(
                order.discount_type ?? 'amount',
                order.discount_type === 'percentage' ? Math.min(value, 100) : value,
              );
            }}
          />
        </Box>
        {totals.discount > 0 && <Row label="Discount" value={`-${formatMoney(totals.discount)}`} />}
        {totals.tax > 0 && <Row label="Tax" value={formatMoney(totals.tax)} />}
        {totals.deliveryFee > 0 && <Row label="Delivery fee" value={formatMoney(totals.deliveryFee)} />}
        <Row label="Total" value={formatMoney(totals.total)} strong />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
          <Button variant="outlined" size="large" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save order'}
          </Button>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            onClick={onCheckout}
            disabled={saving || hasCart || order.subtotal <= 0}
            sx={{ color: '#FFFFFF' }}
          >
            Checkout
          </Button>
        </Box>
        <Button
          fullWidth
          color="error"
          variant="outlined"
          onClick={onCancel}
          disabled={saving}
          sx={{ mt: 1 }}
        >
          Cancel order
        </Button>
        {hasCart && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Save the new items before checkout.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
      <Typography fontWeight={strong ? 700 : 400} variant={strong ? 'h6' : 'body2'}>
        {label}
      </Typography>
      <Typography fontWeight={strong ? 700 : 400} variant={strong ? 'h6' : 'body2'}>
        {value}
      </Typography>
    </Box>
  );
}
