import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { ordersApi } from '@/api/orders';
import { useNotify } from '@/context/NotifyContext';
import { errorMessage } from '@/lib/errors';
import { ORDER_TYPE_LABEL, orderTitle } from '@/lib/format';
import type { Order, OrderItem, OrderRound } from '@/types';

type KitchenView = 'items' | 'orders';

const isUnserved = (item: OrderItem) => !item.served_at;

const preparingRounds = (order: Order) =>
  order.rounds.filter(
    (round) => round.status === 'preparing' && round.items.some(isUnserved),
  );

const activeKitchenOrders = (orders: Order[]) =>
  orders.filter((order) => order.status !== 'cancelled' && preparingRounds(order).length > 0);

function remainingMs(round: OrderRound, now: number) {
  const readyAt = new Date(round.estimated_ready_at).getTime();
  return Number.isFinite(readyAt) ? readyAt - now : null;
}

function formatTimer(ms: number | null) {
  if (ms === null) return 'Time unavailable';
  const seconds = Math.ceil(Math.abs(ms) / 1000);
  const display = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return ms < 0 ? `Overdue ${display}` : display;
}

function Timer({ rounds, now }: { rounds: OrderRound[]; now: number }) {
  const latestRemaining = Math.max(...rounds.map((round) => remainingMs(round, now) ?? Number.NEGATIVE_INFINITY));
  const remaining = Number.isFinite(latestRemaining) ? latestRemaining : null;
  const overdue = remaining !== null && remaining < 0;

  return (
    <Typography
      component="span"
      variant="h6"
      fontWeight={700}
      color={overdue || remaining === null ? 'error.main' : 'primary.main'}
      aria-live="off"
    >
      {formatTimer(remaining)}
    </Typography>
  );
}

export default function KitchenPage() {
  const [view, setView] = useState<KitchenView>('items');
  const [now, setNow] = useState(Date.now());
  const queryClient = useQueryClient();
  const notify = useNotify();
  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', 'kitchen'],
    queryFn: ordersApi.listKitchen,
    refetchInterval: 5_000,
  });
  const markServed = useMutation({
    mutationFn: ordersApi.markServed,
    onSuccess: (_order, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['activity', orderId] });
      notify('Order marked served. Any rounds over 5 minutes late were recorded in the activity log.', 'success');
    },
    onError: (mutationError) => notify(errorMessage(mutationError), 'error'),
  });
  const markItemServed = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: number; itemId: number }) =>
      ordersApi.markItemServed(orderId, itemId),
    onSuccess: (_order, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['activity', orderId] });
      notify('Item marked served.', 'success');
    },
    onError: (mutationError) => notify(errorMessage(mutationError), 'error'),
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', p: 4 }}>
        <CircularProgress aria-label="Loading kitchen orders" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Alert severity="error">{errorMessage(error)}</Alert>
      </Box>
    );
  }

  const orders = activeKitchenOrders(data ?? []);
  const tickets = orders.flatMap((order) =>
    preparingRounds(order).flatMap((round) =>
      round.items
        .filter(isUnserved)
        .map((item) => ({ order, round, item })),
    ),
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5">Kitchen</Typography>
          <Typography variant="body2" color="text.secondary">
            {orders.length} active {orders.length === 1 ? 'order' : 'orders'}
          </Typography>
        </Box>
        <ToggleButtonGroup
          exclusive
          value={view}
          onChange={(_, next: KitchenView | null) => {
            if (next) setView(next);
          }}
          size="small"
          aria-label="Kitchen view"
        >
          <ToggleButton value="items" aria-label="View by item">By item</ToggleButton>
          <ToggleButton value="orders" aria-label="View by order">By orders</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {orders.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Typography color="text.secondary">No orders are currently being prepared.</Typography>
          </CardContent>
        </Card>
      ) : view === 'items' ? (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {tickets.map(({ order, round, item }) => {
            const title = orderTitle(order);
            const timer = remainingMs(round, now);
            return (
              <Card key={`${order.id}-${round.id}-${item.id}`} variant="outlined">
                <CardContent sx={{ display: 'grid', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box>
                      <Typography variant="h6" fontWeight={700}>
                        {item.item_name}{item.is_meal ? ' (Meal)' : ''}
                      </Typography>
                      {item.remarks && (
                        <Typography variant="body2" color="text.secondary">{item.remarks}</Typography>
                      )}
                    </Box>
                    <Chip label={`× ${item.quantity}`} color="primary" />
                  </Box>
                  <Typography variant="body2">
                    Order <strong>{order.order_no}</strong> · {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {ORDER_TYPE_LABEL[order.order_type]} · Round {round.round_no}
                  </Typography>
                  <Typography
                    variant="subtitle1"
                    fontWeight={700}
                    color={timer !== null && timer < 0 ? 'error.main' : 'primary.main'}
                  >
                    {formatTimer(timer)}
                  </Typography>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => markItemServed.mutate({ orderId: order.id, itemId: item.id })}
                    disabled={markItemServed.isPending}
                  >
                    {markItemServed.isPending &&
                    markItemServed.variables?.orderId === order.id &&
                    markItemServed.variables.itemId === item.id
                      ? 'Marking served…'
                      : 'Mark served'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {orders.map((order) => {
            const rounds = preparingRounds(order);
            return (
              <Card key={order.id} variant="outlined">
                <CardContent sx={{ display: 'grid', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                    <Box>
                      <Typography variant="h6" fontWeight={700}>{order.order_no}</Typography>
                      <Typography color="text.secondary">{orderTitle(order)}</Typography>
                    </Box>
                    <Timer rounds={rounds} now={now} />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {ORDER_TYPE_LABEL[order.order_type]} · {rounds.length} active {rounds.length === 1 ? 'round' : 'rounds'}
                  </Typography>
                  {rounds.map((round) => (
                    <Box key={round.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600}>Round {round.round_no}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatTimer(remainingMs(round, now))}
                        </Typography>
                      </Box>
                      {round.items.map((item) => (
                        isUnserved(item) && (
                          <Typography key={item.id} variant="body2" color="text.secondary">
                            {item.quantity} × {item.item_name}{item.is_meal ? ' (Meal)' : ''}
                            {item.remarks ? ` — ${item.remarks}` : ''}
                          </Typography>
                        )
                      ))}
                    </Box>
                  ))}
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => markServed.mutate(order.id)}
                    disabled={markServed.isPending}
                    sx={{ mt: 1 }}
                  >
                    {markServed.isPending && markServed.variables === order.id ? 'Marking served…' : 'Mark served'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
