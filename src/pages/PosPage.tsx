import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Divider, Typography } from '@mui/material';
import { ordersApi } from '@/api/orders';
import { useMenu } from '@/hooks/useMenu';
import { useOpenOrders } from '@/hooks/useOrders';
import { useOrderLock } from '@/hooks/useOrderLock';
import { useNotify } from '@/context/NotifyContext';
import { useAuthStore } from '@/store/authStore';
import { usePosStore } from '@/store/posStore';
import { errorMessage } from '@/lib/errors';
import { orderTitle } from '@/lib/format';
import { cartLineCount, cartSubtotal, computeTotals, validateDetails } from '@/lib/orderRules';
import type { OrderRound, PaymentMethod } from '@/types';
import DraftsPanel from '@/components/pos/DraftsPanel';
import OrderTypeToggle from '@/components/pos/OrderTypeToggle';
import CustomerFields from '@/components/pos/CustomerFields';
import MenuGrid from '@/components/pos/MenuGrid';
import OrderSummary from '@/components/pos/OrderSummary';
import PaymentDialog from '@/components/pos/PaymentDialog';
import SavedRoundDialog from '@/components/pos/SavedRoundDialog';
import ReceiptDialog from '@/components/pos/ReceiptDialog';
import type { Order } from '@/types';

const panelSx = { minHeight: 0, overflow: 'auto', bgcolor: 'background.paper' } as const;

export default function PosPage() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);

  const order = usePosStore((s) => s.order);
  const details = usePosStore((s) => s.details);
  const cart = usePosStore((s) => s.cart);
  const setOrder = usePosStore((s) => s.setOrder);
  const setDetails = usePosStore((s) => s.setDetails);
  const reset = usePosStore((s) => s.reset);

  const { data: menu } = useMenu();
  const { data: openOrders = [], isLoading } = useOpenOrders();

  const [payOpen, setPayOpen] = useState(false);
  const [savedRound, setSavedRound] = useState<{ round: OrderRound; orderNo: string } | null>(null);
  const [receipt, setReceipt] = useState<{
    order: Order;
    method: PaymentMethod;
    amount: number;
    reference: string;
  } | null>(null);

  const refreshOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

  // ---- Mutations ---------------------------------------------------------

  const openMutation = useMutation({
    mutationFn: (id: number) => ordersApi.open(id),
    onSuccess: (opened) => {
      setOrder(opened);
      refreshOrders();
    },
    onError: (error) => {
      notify(errorMessage(error), 'error');
      refreshOrders();
    },
  });

  const createMutation = useMutation({
    mutationFn: () => ordersApi.create('dine_in'),
    onSuccess: (created) => {
      setOrder(created);
      refreshOrders();
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      ordersApi.save(order!.id, {
        ...details,
        items: Object.entries(cart).map(([id, quantity]) => ({ menu_item_id: Number(id), quantity })),
      }),
    onSuccess: ({ order: saved, round }) => {
      reset();
      refreshOrders();
      if (round) setSavedRound({ round, orderNo: saved.order_no });
      else notify('Order saved', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const checkoutMutation = useMutation({
    mutationFn: (p: { method: PaymentMethod; reference: string }) =>
      ordersApi.checkout(order!.id, {
        payments: [
          { method: p.method, amount: totals.total, reference: p.reference.trim() || undefined },
        ],
      }),
    onSuccess: (paid, payment) => {
      reset();
      setPayOpen(false);
      refreshOrders();
      setReceipt({
        order: paid,
        method: payment.method,
        amount: paid.total,
        reference: payment.reference.trim(),
      });
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => ordersApi.cancel(id),
    onSuccess: (cancelled) => {
      if (usePosStore.getState().order?.id === cancelled.id) reset();
      refreshOrders();
      notify('Order cancelled.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  // ---- Derived -----------------------------------------------------------

  const menuItems = menu?.items ?? [];
  const totals = computeTotals(order, cartSubtotal(cart, menuItems));
  const busy = openMutation.isPending || createMutation.isPending || saveMutation.isPending || cancelMutation.isPending;

  // ---- Handlers ----------------------------------------------------------

  /** Leaving the current order releases it. Warns first if it has unsaved items. */
  const leaveCurrentOrder = async (): Promise<boolean> => {
    if (!order) return true;
    if (cartLineCount(cart) > 0 && !window.confirm('Discard the unsaved items on this order?')) return false;
    await ordersApi.release(order.id).catch(() => undefined);
    reset();
    return true;
  };

  const resume = async (id: number) => {
    if (order?.id === id) return;
    if (!(await leaveCurrentOrder())) return;
    openMutation.mutate(id);
  };

  const startNew = async () => {
    if (!(await leaveCurrentOrder())) return;
    createMutation.mutate();
  };

  const handleSave = () => {
    const hasItems = cartLineCount(cart) > 0;
    const hasRounds = (order?.rounds.length ?? 0) > 0;
    if (!hasItems && !hasRounds) return notify('Add at least one item before saving.', 'warning');
    const problem = validateDetails(details);
    if (problem) return notify(problem, 'warning');
    saveMutation.mutate();
  };

  const handleCheckout = () => {
    const problem = validateDetails(details);
    if (problem) return notify(problem, 'warning');
    setPayOpen(true);
  };

  const handleCancel = (id: number) => {
    if (!window.confirm('Cancel this order? This cannot be undone.')) return;
    cancelMutation.mutate(id);
  };

  // ---- Effects -----------------------------------------------------------

  // Keep the lock alive. If it is lost (expired or force-unlocked), close the order.
  useOrderLock(order?.id ?? null, () => {
    reset();
    refreshOrders();
    notify('This order was taken over or timed out. Reopen it from the list.', 'warning');
  });

  // Admin "Resume" from the Orders page arrives here with the order id in router state.
  useEffect(() => {
    const id = (location.state as { resumeOrderId?: number } | null)?.resumeOrderId;
    if (id) {
      window.history.replaceState({}, '');
      openMutation.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the order when leaving the POS screen.
  useEffect(
    () => () => {
      const open = usePosStore.getState().order;
      if (open) {
        ordersApi.release(open.id).catch(() => undefined);
        usePosStore.getState().reset();
      }
    },
    [],
  );

  // Warn before closing the tab with unsaved items.
  useEffect(() => {
    if (cartLineCount(cart) === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [cart]);

  // ---- Render ------------------------------------------------------------

  return (
    <Box
      sx={{
        height: { md: '100%' },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '280px 1fr 340px', lg: '300px 1fr 380px' },
        bgcolor: 'divider',
        gap: '1px', // hairline dividers between panels
      }}
    >
      <Box sx={{ ...panelSx, overflow: 'hidden', maxHeight: { xs: 360, md: 'none' } }}>
        <DraftsPanel
          orders={openOrders}
          loading={isLoading}
          activeId={order?.id ?? null}
          isAdmin={user?.role === 'admin'}
          busy={busy}
          onResume={resume}
          onNew={startNew}
          onCancel={handleCancel}
        />
      </Box>

      <Box sx={{ ...panelSx, bgcolor: 'background.default' }}>
        {order ? (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                {orderTitle(details)}
              </Typography>
              <OrderTypeToggle value={details.order_type} onChange={(order_type) => setDetails({ order_type })} />
            </Box>
            <CustomerFields />
            <Divider />
            <MenuGrid />
          </Box>
        ) : (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 4, textAlign: 'center' }}>
            <Box>
              <Typography variant="h5" gutterBottom>
                No order open
              </Typography>
              <Typography color="text.secondary">
                Pick an order from the list to resume it, or start a new one.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ ...panelSx, overflow: 'hidden', maxHeight: { xs: 560, md: 'none' } }}>
        <OrderSummary
          saving={saveMutation.isPending || cancelMutation.isPending}
          onSave={handleSave}
          onCheckout={handleCheckout}
          onCancel={() => handleCancel(order!.id)}
        />
      </Box>

      <PaymentDialog
        open={payOpen}
        total={totals.total}
        loading={checkoutMutation.isPending}
        onClose={() => setPayOpen(false)}
        onConfirm={(method, reference) => checkoutMutation.mutate({ method, reference })}
      />
      <SavedRoundDialog
        round={savedRound?.round ?? null}
        orderNo={savedRound?.orderNo ?? ''}
        onClose={() => setSavedRound(null)}
      />
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </Box>
  );
}
