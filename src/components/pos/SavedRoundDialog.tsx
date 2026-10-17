import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { formatTime } from '@/lib/format';
import type { OrderRound } from '@/types';

interface Props {
  round: OrderRound | null;
  orderNo: string;
  onClose: () => void;
}

/** Confirms a save and shows the estimated ready time for that round. */
export default function SavedRoundDialog({ round, orderNo, onClose }: Props) {
  return (
    <Dialog open={round !== null} onClose={onClose} fullWidth maxWidth="xs">
      {round && (
        <>
          <DialogTitle>Round {round.round_no} saved</DialogTitle>
          <DialogContent>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              About {round.estimated_minutes} min
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Ready around {formatTime(round.estimated_ready_at)}
            </Typography>
            <Typography variant="body2">
              {round.items.map((i) => `${i.quantity} × ${i.item_name}`).join(', ')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Order {orderNo} is back in the open orders list. Resume it to add more or check out.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button variant="contained" onClick={onClose} autoFocus>
              Done
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
