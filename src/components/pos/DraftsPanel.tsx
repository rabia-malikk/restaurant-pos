import { Box, Button, ButtonBase, Chip, CircularProgress, Divider, Paper, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { formatMoney, formatTime, itemCount, orderTitle, ORDER_TYPE_LABEL, STATUS_LABEL } from '@/lib/format';
import type { Order } from '@/types';

interface Props {
  orders: Order[];
  loading: boolean;
  activeId: number | null;
  isAdmin: boolean;
  busy: boolean;
  onResume: (id: number) => void;
  onNew: () => void;
  onCancel: (id: number) => void;
}

/** Left panel. Staff see their own resumable orders; admins see everyone's. */
export default function DraftsPanel({ orders, loading, activeId, isAdmin, busy, onResume, onNew, onCancel }: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="h6">{isAdmin ? 'All open orders' : 'My open orders'}</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onNew}
          disabled={busy}
          sx={{ flexShrink: 0, whiteSpace: 'nowrap', px: { xs: 1.25, sm: 2 } }}
        >
          New order
        </Button>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {loading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress size={28} aria-label="Loading orders" />
          </Box>
        )}

        {!loading && orders.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 1 }}>
            No open orders. Start one with New order.
          </Typography>
        )}

        {orders.map((order) => {
          const active = order.id === activeId;
          return (
            <Paper
              key={order.id}
              variant="outlined"
              sx={{
                borderColor: active ? 'primary.main' : 'divider',
                bgcolor: active ? 'action.hover' : 'background.paper',
                boxShadow: (t) => (active ? `0 0 0 1px ${t.palette.primary.main}` : 'none'),
              }}
            >
              <ButtonBase
                onClick={() => onResume(order.id)}
                sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1.5, borderRadius: 'inherit' }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography fontWeight={700}>{orderTitle(order)}</Typography>
                  <Typography fontWeight={600}>{formatMoney(order.total)}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {order.order_no}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                  <Chip size="small" label={ORDER_TYPE_LABEL[order.order_type]} />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={STATUS_LABEL[order.status]}
                    color={order.status === 'in_progress' ? 'secondary' : 'default'}
                  />
                  <Chip size="small" variant="outlined" label={`${itemCount(order)} items`} />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {isAdmin ? `${order.created_by_name}, ` : ''}
                  saved {formatTime(order.updated_at)}
                </Typography>
              </ButtonBase>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1, pb: 0.5 }}>
                <Button
                  size="small"
                  color="error"
                  startIcon={<CancelOutlinedIcon />}
                  onClick={() => onCancel(order.id)}
                  disabled={busy}
                >
                  Cancel order
                </Button>
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
