import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/api/orders';

/** Resumable orders for the left panel. Polls as a fallback when websockets are unavailable. */
export const useOpenOrders = () =>
  useQuery({ queryKey: ['orders', 'open'], queryFn: ordersApi.list, refetchInterval: 15_000 });

/** Users with Orders access: all orders for admins, own orders for staff. */
export const useAllOrders = () =>
  useQuery({ queryKey: ['orders', 'all'], queryFn: ordersApi.listAll, refetchInterval: 30_000 });
