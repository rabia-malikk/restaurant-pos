import { USE_MOCK } from '@/config';
import type {
  ActivityEntry,
  CheckoutPayload,
  Order,
  OrderType,
  SaveOrderPayload,
  SaveOrderResult,
} from '@/types';
import { http } from './client';
import { mock } from './mockDb';

const data = <T>(promise: Promise<{ data: T }>) => promise.then((r) => r.data);
const done = (promise: Promise<unknown>) => promise.then(() => undefined);

export const ordersApi = {
  /** Resumable orders (draft + in progress). Staff: own. Admin: everyone's. Orders open elsewhere are hidden. */
  list: (): Promise<Order[]> => (USE_MOCK ? mock.listOrders() : data(http.get<Order[]>('/orders'))),

  /** Admin only: every order in every status. */
  listAll: (): Promise<Order[]> =>
    USE_MOCK ? mock.listAllOrders() : data(http.get<Order[]>('/orders/all')),

  /** Creates a draft that is already locked to the caller. */
  create: (orderType: OrderType): Promise<Order> =>
    USE_MOCK ? mock.createOrder(orderType) : data(http.post<Order>('/orders', { order_type: orderType })),

  get: (id: number): Promise<Order> =>
    USE_MOCK ? mock.getOrder(id) : data(http.get<Order>(`/orders/${id}`)),

  /** Resume: takes the lock. Fails with 409 when another user has it open. */
  open: (id: number): Promise<Order> =>
    USE_MOCK ? mock.openOrder(id) : data(http.post<Order>(`/orders/${id}/open`)),

  heartbeat: (id: number): Promise<void> =>
    USE_MOCK ? mock.heartbeat(id) : done(http.post(`/orders/${id}/heartbeat`)),

  release: (id: number): Promise<void> =>
    USE_MOCK ? mock.releaseOrder(id) : done(http.post(`/orders/${id}/release`)),

  /** Saves details and turns the cart into a new round. Releases the lock. */
  save: (id: number, payload: SaveOrderPayload): Promise<SaveOrderResult> =>
    USE_MOCK ? mock.saveOrder(id, payload) : data(http.post<SaveOrderResult>(`/orders/${id}/save`, payload)),

  checkout: (id: number, payload: CheckoutPayload): Promise<Order> =>
    USE_MOCK ? mock.checkout(id, payload) : data(http.post<Order>(`/orders/${id}/checkout`, payload)),

  cancel: (id: number): Promise<Order> =>
    USE_MOCK ? mock.cancelOrder(id) : data(http.post<Order>(`/orders/${id}/cancel`)),

  /** Admin only. Marks all preparing rounds on the order as served. */
  markServed: (id: number): Promise<Order> =>
    USE_MOCK ? mock.markOrderServed(id) : data(http.post<Order>(`/orders/${id}/serve`)),

  /** Admin only. */
  forceUnlock: (id: number): Promise<void> =>
    USE_MOCK ? mock.forceUnlock(id) : done(http.post(`/orders/${id}/force-unlock`)),

  /** Admin only. */
  activity: (id: number): Promise<ActivityEntry[]> =>
    USE_MOCK ? mock.activity(id) : data(http.get<ActivityEntry[]>(`/orders/${id}/activity`)),
};
