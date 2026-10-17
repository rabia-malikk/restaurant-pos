import { create } from 'zustand';
import type { Cart } from '@/lib/orderRules';
import type { Order, OrderDetails } from '@/types';

export const emptyDetails: OrderDetails = {
  order_type: 'dine_in',
  customer_name: '',
  customer_phone: '',
  delivery_address: '',
  table_no: '',
  notes: '',
};

export const detailsOf = (o: Order): OrderDetails => ({
  order_type: o.order_type,
  customer_name: o.customer_name,
  customer_phone: o.customer_phone,
  delivery_address: o.delivery_address,
  table_no: o.table_no,
  notes: o.notes,
});

interface PosState {
  /** The order currently open on this screen (null when none). */
  order: Order | null;
  /** Editable header fields (type, customer, table). Sent on Save. */
  details: OrderDetails;
  /** Items added since the last save. Becomes the next round on Save. */
  cart: Cart;

  setOrder: (order: Order) => void;
  setDetails: (patch: Partial<OrderDetails>) => void;
  addItem: (menuItemId: number) => void;
  removeItem: (menuItemId: number) => void;
  clearCart: () => void;
  reset: () => void;
}

export const usePosStore = create<PosState>()((set) => ({
  order: null,
  details: emptyDetails,
  cart: {},

  setOrder: (order) => set({ order, details: detailsOf(order), cart: {} }),

  setDetails: (patch) => set((s) => ({ details: { ...s.details, ...patch } })),

  addItem: (id) => set((s) => ({ cart: { ...s.cart, [id]: (s.cart[id] ?? 0) + 1 } })),

  removeItem: (id) =>
    set((s) => {
      const cart = { ...s.cart };
      const qty = (cart[id] ?? 0) - 1;
      if (qty <= 0) delete cart[id];
      else cart[id] = qty;
      return { cart };
    }),

  clearCart: () => set({ cart: {} }),

  reset: () => set({ order: null, details: emptyDetails, cart: {} }),
}));
