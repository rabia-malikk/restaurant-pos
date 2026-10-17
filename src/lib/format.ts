import { CURRENCY } from '@/config';
import type { OrderType, OrderStatus, PaymentMethod, Order } from '@/types';

const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 2,
});

export const formatMoney = (value: number) => money.format(value);

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  checked_out: 'Paid',
  cancelled: 'Cancelled',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  online: 'Online',
  other: 'Other',
};

/** Short name shown on order cards: the table, the customer, or a fallback. */
export function orderTitle(order: Pick<Order, 'order_type' | 'table_no' | 'customer_name'>): string {
  if (order.order_type === 'dine_in' && order.table_no) return `Table ${order.table_no}`;
  if (order.customer_name) return order.customer_name;
  return 'No name yet';
}

export function itemCount(order: Pick<Order, 'rounds'>): number {
  return order.rounds.reduce(
    (sum, round) => sum + round.items.reduce((s, item) => s + item.quantity, 0),
    0,
  );
}
