import { create } from 'zustand';
import type { Cart, CartLine } from '@/lib/orderRules';
import type { DiscountType, Order, OrderDetails } from '@/types';

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
  customer_name: o.customer_name ?? '',
  customer_phone: o.customer_phone ?? '',
  delivery_address: o.delivery_address ?? '',
  table_no: o.table_no ?? '',
  notes: o.notes ?? '',
});

interface PosState {
  /** The order currently open on this screen (null when none). */
  order: Order | null;
  /** Editable header fields (type, customer, table). Sent on Save. */
  details: OrderDetails;
  /** Items added since the last save. Becomes the next round on Save. */
  cart: Cart;
  nextCartLineKey: number;

  setOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  setDiscount: (discount_type: DiscountType, discount_value: number) => void;
  setDetails: (patch: Partial<OrderDetails>) => void;
  addItem: (menuItemId: number) => void;
  removeItem: (menuItemId: number) => void;
  updateCartLine: (key: number, patch: Partial<Pick<CartLine, 'is_meal' | 'remarks'>>) => void;
  clearCart: () => void;
  reset: () => void;
}

export const usePosStore = create<PosState>()((set) => ({
  order: null,
  details: emptyDetails,
  cart: [],
  nextCartLineKey: 1,

  setOrder: (order) => set({ order, details: detailsOf(order), cart: [] }),
  updateOrder: (order) => set({ order }),
  setDiscount: (discount_type, discount_value) =>
    set((s) => ({
      order: s.order ? { ...s.order, discount_type, discount_value } : null,
    })),

  setDetails: (patch) => set((s) => ({ details: { ...s.details, ...patch } })),

  addItem: (id) =>
    set((s) => ({
      cart: [...s.cart, { key: s.nextCartLineKey, menu_item_id: id, is_meal: false, remarks: '' }],
      nextCartLineKey: s.nextCartLineKey + 1,
    })),

  removeItem: (id) =>
    set((s) => {
      let index = -1;
      for (let i = s.cart.length - 1; i >= 0; i -= 1) {
        if (s.cart[i].menu_item_id === id) {
          index = i;
          break;
        }
      }
      if (index < 0) return {};
      return { cart: s.cart.filter((_, lineIndex) => lineIndex !== index) };
    }),

  updateCartLine: (key, patch) =>
    set((s) => ({
      cart: s.cart.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    })),

  clearCart: () => set({ cart: [] }),

  reset: () => set((s) => ({ order: null, details: emptyDetails, cart: [], nextCartLineKey: s.nextCartLineKey })),
}));
