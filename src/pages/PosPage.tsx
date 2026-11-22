import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, TextField, Typography } from '@mui/material';
import { ordersApi } from '@/api/orders';
import { shiftsApi } from '@/api/shifts';
import { useMenu } from '@/hooks/useMenu';
import { useOpenOrders } from '@/hooks/useOrders';
import { useOrderLock } from '@/hooks/useOrderLock';
import { useNotify } from '@/context/NotifyContext';
import { useAuthStore } from '@/store/authStore';
import { usePosStore } from '@/store/posStore';
import { errorMessage } from '@/lib/errors';
import { orderTitle } from '@/lib/format';
import { cartLineCount, cartSubtotal, computeTotals, validateDetails } from '@/lib/orderRules';
import type { Order, OrderReceipt, OrderRound, PaymentMethod } from '@/types';
import DraftsPanel from '@/components/pos/DraftsPanel';
import OrderTypeToggle from '@/components/pos/OrderTypeToggle';
import CustomerFields from '@/components/pos/CustomerFields';
import MenuGrid from '@/components/pos/MenuGrid';
import OrderSummary from '@/components/pos/OrderSummary';
import PaymentDialog from '@/components/pos/PaymentDialog';
import SavedRoundDialog from '@/components/pos/SavedRoundDialog';
import ReceiptDialog from '@/components/pos/ReceiptDialog';

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
  const updateOrder = usePosStore((s) => s.updateOrder);
  const setDetails = usePosStore((s) => s.setDetails);
  const reset = usePosStore((s) => s.reset);

  const menuQuery = useMenu();
  const { data: menu } = menuQuery;
  const { data: openOrders = [], isLoading } = useOpenOrders();
  const shiftQueryKey = ['shifts', 'me', user?.id] as const;
  const { data: shiftStatus } = useQuery({
    queryKey: shiftQueryKey,
    queryFn: shiftsApi.current,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  const shiftActive = Boolean(shiftStatus?.active_shift);

  const [payOpen, setPayOpen] = useState(false);
  const [savedRound, setSavedRound] = useState<{ order: Order; round: OrderRound } | null>(null);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const handledResumeId = useRef<number | null>(null);

  const refreshOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

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
        discount_type: order!.discount_type ?? 'amount',
        discount_value: order!.discount_value ?? order!.discount ?? 0,
        items: cart.map((line) => ({
          menu_item_id: line.menu_item_id,
          quantity: 1,
          is_meal: line.is_meal,
          remarks: line.remarks.trim(),
        })),
      }),
    onSuccess: ({ order: saved, round }) => {
      reset();
      refreshOrders();
      if (round) setSavedRound({ order: saved, round });
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
        payments: [
          {
            method: payment.method,
            amount: paid.total,
            reference: payment.reference.trim() || null,
          },
        ],
      });
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (input: { id: number; reason?: string }) => ordersApi.cancel(input.id, input.reason),
    onSuccess: (cancelled) => {
      if (usePosStore.getState().order?.id === cancelled.id) reset();
      refreshOrders();
      setCancelOrderId(null);
      setCancelReason('');
      notify('Order cancelled.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const removeSavedItemMutation = useMutation({
    mutationFn: (itemId: number) => ordersApi.removeItem(order!.id, itemId),
    onSuccess: (updated) => {
      if (usePosStore.getState().order?.id === updated.id) updateOrder(updated);
      refreshOrders();
      notify('Saved item removed from the order.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const menuItems = menu?.items ?? [];
  const totals = computeTotals(order, cartSubtotal(cart, menuItems));
  const busy =
    openMutation.isPending ||
    createMutation.isPending ||
    saveMutation.isPending ||
    cancelMutation.isPending ||
    removeSavedItemMutation.isPending;

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
    if (user?.role === 'admin') {
      if (!window.confirm('Cancel this order? This cannot be undone.')) return;
      cancelMutation.mutate({ id });
      return;
    }
    setCancelReason('');
    setCancelOrderId(id);
  };

  const submitCancellation = () => {
    const reason = cancelReason.trim();
    if (!reason) {
      notify('Enter a reason for cancelling this order.', 'warning');
      return;
    }
    cancelMutation.mutate({ id: cancelOrderId!, reason });
  };

  const handleRemoveSavedItem = (itemId: number, itemName: string) => {
    if (!window.confirm(`Remove ${itemName} from this saved order? Its line will remain in order history.`)) return;
    removeSavedItemMutation.mutate(itemId);
  };

  // Keep the lock alive. If it is lost (expired or force-unlocked), close the order.
  useOrderLock(order?.id ?? null, () => {
    reset();
    refreshOrders();
    notify('This order was taken over or timed out. Reopen it from the list.', 'warning');
  });

  // Resume from the Orders page arrives here with the order id in router state.
  useEffect(() => {
    const id = (location.state as { resumeOrderId?: number } | null)?.resumeOrderId;
    if (!id) {
      handledResumeId.current = null;
      return;
    }
    if (id && shiftActive && handledResumeId.current !== id) {
      handledResumeId.current = id;
      window.history.replaceState({}, '');
      openMutation.mutate(id);
    }
  }, [location.state, openMutation, shiftActive]);

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

  return (
    <Box sx={{ position: 'relative', height: { md: '100%' }, minHeight: 360 }}>
      <fieldset
        disabled={!shiftActive}
        aria-disabled={!shiftActive}
        style={{
          border: 0,
          margin: 0,
          padding: 0,
          minWidth: 0,
          height: '100%',
          opacity: shiftActive ? 1 : 0.45,
          pointerEvents: shiftActive ? 'auto' : 'none',
        }}
      >
        <Box
          sx={{
            height: { md: '100%' },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '280px 1fr 340px', lg: '300px 1fr 380px' },
            bgcolor: 'divider',
            gap: '1px',
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
                {menuQuery.isError ? (
                  <Alert severity="error">{errorMessage(menuQuery.error)}</Alert>
                ) : (
                  <MenuGrid />
                )}
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
              saving={saveMutation.isPending || cancelMutation.isPending || removeSavedItemMutation.isPending}
              onSave={handleSave}
              onCheckout={handleCheckout}
              onCancel={() => handleCancel(order!.id)}
              onRemoveSavedItem={handleRemoveSavedItem}
              removingSavedItem={removeSavedItemMutation.isPending}
            />
          </Box>
        </Box>
      </fieldset>

      {!shiftActive && (
        <Alert
          severity="info"
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(90%, 480px)',
            boxShadow: 3,
          }}
        >
          Order taking is disabled until you start your shift using the button in the header.
        </Alert>
      )}

      {shiftActive && (
        <>
          <Dialog
            open={cancelOrderId !== null}
            onClose={() => {
              if (!cancelMutation.isPending) setCancelOrderId(null);
            }}
            fullWidth
            maxWidth="sm"
            aria-labelledby="cancel-order-title"
          >
            <DialogTitle id="cancel-order-title">Reason for cancelling order</DialogTitle>
            <DialogContent>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Enter a reason to keep with the order record. This cannot be undone.
              </Typography>
              <TextField
                autoFocus
                fullWidth
                multiline
                minRows={3}
                label="Cancellation reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value.slice(0, 500))}
                inputProps={{ maxLength: 500 }}
                helperText={`${cancelReason.length}/500`}
                disabled={cancelMutation.isPending}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCancelOrderId(null)} disabled={cancelMutation.isPending}>
                Keep order
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={submitCancellation}
                disabled={!cancelReason.trim() || cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Cancel order'}
              </Button>
            </DialogActions>
          </Dialog>
          <PaymentDialog
            open={payOpen}
            total={totals.total}
            loading={checkoutMutation.isPending}
            onClose={() => setPayOpen(false)}
            onConfirm={(method, reference) => checkoutMutation.mutate({ method, reference })}
          />
          <SavedRoundDialog
            order={savedRound?.order ?? null}
            round={savedRound?.round ?? null}
            onClose={() => setSavedRound(null)}
          />
          <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
        </>
      )}
    </Box>
  );
}
