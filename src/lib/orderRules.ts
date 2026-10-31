import { TAX_PERCENT } from '@/config';
import type { DiscountType, MenuItem, Order, OrderDetails } from '@/types';

export interface CartLine {
  key: number;
  menu_item_id: number;
  is_meal: boolean;
  remarks: string;
}

export type Cart = CartLine[];

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
  const menuById = new Map(items.map((item) => [item.id, item]));
  return cart.reduce((sum, line) => {
    const item = menuById.get(line.menu_item_id);
    if (!item) return sum;
    return sum + item.price + (line.is_meal && item.meal_available ? item.meal_price : 0);
  }, 0);
}

export function cartLineCount(cart: Cart): number {
  return cart.length;
}

/** Kitchen time for the next round: the slowest item in the cart. */
export function cartPrepMinutes(cart: Cart, items: MenuItem[]): number {
  const menuById = new Map(items.map((item) => [item.id, item]));
  return cart.reduce(
    (max, line) => Math.max(max, menuById.get(line.menu_item_id)?.prep_time_minutes ?? 0),
    0,
  );
}

export function calcTotals(subtotal: number, discount: number, deliveryFee: number) {
  const tax = Math.round((subtotal - discount) * TAX_PERCENT) / 100;
  const total = Math.round((subtotal - discount + tax + deliveryFee) * 100) / 100;
  return { tax, total };
}

export function calculateDiscount(subtotal: number, type: DiscountType, value: number): number {
  const requested = Math.max(0, Number.isFinite(value) ? value : 0);
  const amount = type === 'percentage' ? (subtotal * Math.min(requested, 100)) / 100 : requested;
  return Math.min(subtotal, Math.round(amount * 100) / 100);
}

/** Totals shown in the UI: saved rounds plus the unsaved cart. The server recalculates on save. */
export function computeTotals(order: Order | null, cartSub: number) {
  const subtotal = (order?.subtotal ?? 0) + cartSub;
  const discount = order
    ? calculateDiscount(subtotal, order.discount_type ?? 'amount', order.discount_value ?? order.discount ?? 0)
    : 0;
  const deliveryFee = order?.delivery_fee ?? 0;
  const { tax, total } = calcTotals(subtotal, discount, deliveryFee);
  return { subtotal, discount, deliveryFee, tax, total };
}
