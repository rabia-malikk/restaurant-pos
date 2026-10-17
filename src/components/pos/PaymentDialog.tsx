import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { formatMoney, PAYMENT_LABEL } from '@/lib/format';
import type { PaymentMethod } from '@/types';

interface Props {
  open: boolean;
  total: number;
  loading: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, reference: string) => void;
}

export default function PaymentDialog({ open, total, loading, onClose, onConfirm }: Props) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const needsReference = method === 'card' || method === 'online';

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Checkout</DialogTitle>
      <DialogContent>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
          {formatMoney(total)}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Payment method
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          color="primary"
          value={method}
          onChange={(_, next: PaymentMethod | null) => next && setMethod(next)}
          aria-label="Payment method"
        >
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <ToggleButton key={m} value={m}>
              {PAYMENT_LABEL[m]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {needsReference && (
          <Box sx={{ mt: 2 }}>
            <TextField
              label="Slip or transaction number (optional)"
              fullWidth
              size="small"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="contained" size="large" onClick={() => onConfirm(method, reference)} disabled={loading}>
          {loading ? 'Processing…' : `Take ${formatMoney(total)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
