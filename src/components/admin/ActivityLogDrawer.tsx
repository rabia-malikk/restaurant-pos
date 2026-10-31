import { useQuery } from '@tanstack/react-query';
import { Box, CircularProgress, Divider, Drawer, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ordersApi } from '@/api/orders';
import { formatDateTime } from '@/lib/format';

const ACTION_LABEL: Record<string, string> = {
  order_created: 'Order created',
  order_opened: 'Order opened',
  order_released: 'Order closed on screen',
  round_saved: 'Round saved',
  round_served: 'Order marked served',
  item_served: 'Item marked served',
  kitchen_overdue: 'Kitchen order overdue by more than 5 minutes',
  draft_saved: 'Details saved',
  checkout: 'Paid',
  order_cancelled: 'Order cancelled',
  force_unlock: 'Unlocked by admin',
  item_added: 'Item added',
  item_removed: 'Item removed',
  qty_changed: 'Quantity changed',
  discount_applied: 'Discount applied',
};

/** Admin-only history of everything that happened to one order. */
export default function ActivityLogDrawer({ orderId, onClose }: { orderId: number | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['activity', orderId],
    queryFn: () => ordersApi.activity(orderId!),
    enabled: orderId !== null,
  });

  return (
    <Drawer anchor="right" open={orderId !== null} onClose={onClose}>
      <Box sx={{ width: { xs: '100vw', sm: 420 }, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Activity log</Typography>
          <IconButton aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ my: 1 }} />

        {isLoading && <CircularProgress size={28} aria-label="Loading activity" />}
        {error && <Typography color="error">Could not load the activity log.</Typography>}
        {data?.length === 0 && <Typography color="text.secondary">Nothing recorded yet.</Typography>}

        {data?.map((entry) => (
          <Box key={entry.id} sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Typography fontWeight={600}>{ACTION_LABEL[entry.action] ?? entry.action}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(entry.created_at)}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              by {entry.user_name}
            </Typography>
            {entry.details && (
              <Typography variant="body2" sx={{ mt: 0.5, wordBreak: 'break-word' }}>
                {summarise(entry.details)}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Drawer>
  );
}

function summarise(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof details.round_no === 'number') parts.push(`Round ${details.round_no}`);
  if (typeof details.item_name === 'string') parts.push(details.item_name);
  if (Array.isArray(details.round_nos)) parts.push(`Rounds ${(details.round_nos as number[]).join(', ')}`);
  if (Array.isArray(details.rounds)) {
    parts.push(
      (details.rounds as { round_no: number; overdue_minutes: number }[])
        .map((round) => `Round ${round.round_no}: ${round.overdue_minutes} min overdue`)
        .join(', '),
    );
  }
  if (Array.isArray(details.items)) {
    parts.push(
      (details.items as { name: string; qty: number }[]).map((i) => `${i.qty} × ${i.name}`).join(', '),
    );
  }
  if (typeof details.estimated_minutes === 'number') parts.push(`about ${details.estimated_minutes} min`);
  if (typeof details.method === 'string') parts.push(`method: ${details.method}`);
  if (typeof details.amount === 'number') parts.push(`amount: ${details.amount}`);
  if (typeof details.previous_holder === 'string') parts.push(`was open for ${details.previous_holder}`);
  return parts.length ? parts.join('. ') : JSON.stringify(details);
}
