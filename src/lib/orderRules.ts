import { TAX_PERCENT } from '@/config';
import type { MenuItem, Order, OrderDetails } from '@/types';

export type Cart = Record<number, number>; // menu item id -> quantity

/** Returns an error message, or null when the order details are complete. */
export function validateDetails(d: OrderDetails): string | null {
  if (d.order_type === 'dine_in' && !d.table_no.trim()) {
    return 'Enter a table number for dine-in orders.';
  }
  if (d.order_type === 'takeaway' && !d.customer_name.trim()) {
    return 'Enter the customer name for takeaway orders.';
  }
  if (
    d.order_type === 'delivery' &&
    (!d.customer_name.trim() || !d.customer_phone.trim() || !d.delivery_address.trim())
  ) {
    return 'Delivery orders need a name, phone number and address.';
  }
  return null;
}

export function cartSubtotal(cart: Cart, items: MenuItem[]): number {
  return items.reduce((sum, item) => sum + (cart[item.id] ?? 0) * item.price, 0);
}

export function cartLineCount(cart: Cart): number {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}

/** Kitchen time for the next round: the slowest item in the cart. */
export function cartPrepMinutes(cart: Cart, items: MenuItem[]): number {
  return items.reduce(
    (max, item) => ((cart[item.id] ?? 0) > 0 ? Math.max(max, item.prep_time_minutes) : max),
    0,
  );
}

export function calcTotals(subtotal: number, discount: number, deliveryFee: number) {
  const tax = Math.round((subtotal - discount) * TAX_PERCENT) / 100;
  const total = Math.round((subtotal - discount + tax + deliveryFee) * 100) / 100;
  return { tax, total };
}

/** Totals shown in the UI: saved rounds plus the unsaved cart. The server recalculates on save. */
export function computeTotals(order: Order | null, cartSub: number) {
  const subtotal = (order?.subtotal ?? 0) + cartSub;
  const discount = order?.discount ?? 0;
  const deliveryFee = order?.delivery_fee ?? 0;
  const { tax, total } = calcTotals(subtotal, discount, deliveryFee);
  return { subtotal, discount, deliveryFee, tax, total };
}
