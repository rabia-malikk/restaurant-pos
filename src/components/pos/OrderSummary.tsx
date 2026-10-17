import { Box, Button, Chip, Divider, IconButton, Typography } from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useMenu } from '@/hooks/useMenu';
import { usePosStore } from '@/store/posStore';
import { formatMoney, formatTime, STATUS_LABEL } from '@/lib/format';
import { cartLineCount, cartPrepMinutes, cartSubtotal, computeTotals } from '@/lib/orderRules';

interface Props {
  saving: boolean;
  onSave: () => void;
  onCheckout: () => void;
  onCancel: () => void;
}

/** Right panel: saved rounds, the unsaved cart, totals, and the Save / Checkout actions. */
export default function OrderSummary({ saving, onSave, onCheckout, onCancel }: Props) {
  const order = usePosStore((s) => s.order);
  const cart = usePosStore((s) => s.cart);
  const removeItem = usePosStore((s) => s.removeItem);
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
  const cartLines = menuItems.filter((m) => (cart[m.id] ?? 0) > 0);
  const hasCart = cartLines.length > 0;
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
        {order.rounds.length === 0 && !hasCart && (
          <Typography color="text.secondary">No items yet. Add items from the menu.</Typography>
        )}

        {order.rounds.map((round) => (
          <Box key={round.id}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography fontWeight={700}>Round {round.round_no}</Typography>
              <Typography variant="body2" color="text.secondary">
                ready about {formatTime(round.estimated_ready_at)}
              </Typography>
            </Box>
            {round.items.map((item) => (
              <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.25 }}>
                <Typography variant="body2">
                  {item.quantity} × {item.item_name}
                </Typography>
                <Typography variant="body2">{formatMoney(item.line_total)}</Typography>
              </Box>
            ))}
          </Box>
        ))}

        {hasCart && (
          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(232, 163, 61, 0.14)' }}>
            <Typography fontWeight={700}>New items, not saved yet</Typography>
            {cartLines.map((item) => (
              <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="body2">
                  {cart[item.id]} × {item.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2">{formatMoney(cart[item.id] * item.price)}</Typography>
                  <IconButton size="small" aria-label={`Remove one ${item.name}`} onClick={() => removeItem(item.id)}>
                    <RemoveCircleOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
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
            disabled={saving || hasCart || order.rounds.length === 0}
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
