import type {
  ActivityEntry,
  CheckoutPayload,
  Order,
  OrderType,
  SaveOrderPayload,
  SaveOrderResult,
} from '@/types';
import { http } from './client';

const data = <T>(promise: Promise<{ data: T }>) => promise.then((r) => r.data);
const done = (promise: Promise<unknown>) => promise.then(() => undefined);

export const ordersApi = {
  /** Resumable orders (draft + in progress). Staff: own. Admin: everyone's. Orders open elsewhere are hidden. */
  list: (): Promise<Order[]> => data(http.get<Order[]>('/orders')),

  /** Admin only: every order in every status. */
  listAll: (): Promise<Order[]> =>
    data(http.get<Order[]>('/orders/all')),

  /** Creates a draft that is already locked to the caller. */
  create: (orderType: OrderType): Promise<Order> =>
    data(http.post<Order>('/orders', { order_type: orderType })),

  get: (id: number): Promise<Order> =>
    data(http.get<Order>(`/orders/${id}`)),

  /** Resume: takes the lock. Fails with 409 when another user has it open. */
  open: (id: number): Promise<Order> =>
    data(http.post<Order>(`/orders/${id}/open`)),

  heartbeat: (id: number): Promise<void> =>
    done(http.post(`/orders/${id}/heartbeat`)),

  release: (id: number): Promise<void> =>
    done(http.post(`/orders/${id}/release`)),

  /** Saves details and turns the cart into a new round. Releases the lock. */
  save: (id: number, payload: SaveOrderPayload): Promise<SaveOrderResult> =>
    data(http.post<SaveOrderResult>(`/orders/${id}/save`, payload)),

  removeItem: (orderId: number, itemId: number): Promise<Order> =>
    data(http.delete<Order>(`/orders/${orderId}/items/${itemId}`)),

  checkout: (id: number, payload: CheckoutPayload): Promise<Order> =>
    data(http.post<Order>(`/orders/${id}/checkout`, payload)),

  cancel: (id: number): Promise<Order> =>
    data(http.post<Order>(`/orders/${id}/cancel`)),

  /** Admin only. Marks all preparing rounds on the order as served. */
  markServed: (id: number): Promise<Order> =>
    data(http.post<Order>(`/orders/${id}/serve`)),

  /** Admin only. */
  forceUnlock: (id: number): Promise<void> =>
    done(http.post(`/orders/${id}/force-unlock`)),

  /** Admin only. */
  activity: (id: number): Promise<ActivityEntry[]> =>
    data(http.get<ActivityEntry[]>(`/orders/${id}/activity`)),
};
