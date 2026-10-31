import { useEffect } from 'react';
import { GlobalStyles } from '@mui/material';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from '@mui/material';
import { formatDateTime, formatTime, ORDER_TYPE_LABEL, orderTitle } from '@/lib/format';
import type { Order, OrderRound } from '@/types';

interface Props {
  order: Order | null;
  round: OrderRound | null;
  onClose: () => void;
}

/** Shows the saved round and prints a price-free kitchen ticket. */
export default function SavedRoundDialog({ order, round, onClose }: Props) {
  useEffect(() => {
    if (!round) return undefined;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [round?.id]);

  return (
    <>
      {round && (
        <GlobalStyles
          styles={{
            '@media print': {
              'body *': { visibility: 'hidden !important' },
              '#kitchen-ticket, #kitchen-ticket *': { visibility: 'visible !important' },
              '#kitchen-ticket': {
                position: 'fixed',
                inset: '0 auto auto 0',
                width: '76mm',
                maxWidth: '76mm',
                margin: 0,
                boxShadow: 'none',
                border: 0,
                overflow: 'visible',
              },
              '.MuiDialog-root, .MuiDialog-container, .MuiDialog-paper': {
                position: 'static',
                display: 'block',
                width: '76mm',
                maxWidth: '76mm',
                maxHeight: 'none',
                margin: 0,
                padding: 0,
                boxShadow: 'none',
                overflow: 'visible',
                transform: 'none',
              },
              '.MuiDialogTitle-root, .MuiDialogActions-root, .MuiBackdrop-root': { display: 'none' },
              '.MuiDialogContent-root': { padding: 0, overflow: 'visible' },
            },
          }}
        />
      )}
      <Dialog open={round !== null && order !== null} onClose={onClose} fullWidth maxWidth="xs">
        {round && order && (
          <>
            <DialogTitle>Round {round.round_no} saved</DialogTitle>
            <DialogContent>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                About {round.estimated_minutes} min
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Ready around {formatTime(round.estimated_ready_at)}
              </Typography>
              <Box
                id="kitchen-ticket"
                component="article"
                aria-label="Kitchen order ticket"
                sx={{
                  width: '100%',
                  maxWidth: 340,
                  p: 2,
                  bgcolor: '#fff',
                  color: '#18262B',
                  border: 1,
                  borderColor: 'divider',
                  '@media print': {
                    width: '76mm',
                    maxWidth: '76mm',
                    p: '5mm',
                    border: 0,
                    bgcolor: '#fff',
                  },
                }}
              >
                <Typography variant="h6" fontWeight={800} textAlign="center">
                  KITCHEN TICKET
                </Typography>
                <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
                <TicketRow label="Order" value={order.order_no} />
                <TicketRow label="Type" value={ORDER_TYPE_LABEL[order.order_type]} />
                <TicketRow label="Customer / table" value={orderTitle(order)} />
                <TicketRow label="Round" value={String(round.round_no)} />
                <TicketRow label="Saved" value={formatDateTime(round.created_at)} />
                <TicketRow label="Ready around" value={formatTime(round.estimated_ready_at)} />
                <Divider sx={{ borderStyle: 'dashed', my: 1 }} />
                {round.items.map((item) => (
                  <Box key={item.id} sx={{ py: 0.5 }}>
                    <Typography variant="body1" fontWeight={700}>
                      {item.quantity} × {item.item_name}{item.is_meal ? ' (Meal)' : ''}
                    </Typography>
                    {item.remarks && (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', pl: 2 }}>
                        Note: {item.remarks}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Order {order.order_no} is back in the open orders list. Resume it to add more or check out.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => window.print()}>Print again</Button>
              <Button variant="contained" onClick={onClose} autoFocus>
                Done
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}

function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.25 }}>
      <Typography variant="body2" fontWeight={600}>{label}</Typography>
      <Typography variant="body2" textAlign="right">{value}</Typography>
    </Box>
  );
}
