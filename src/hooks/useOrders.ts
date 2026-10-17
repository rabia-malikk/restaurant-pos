import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/api/orders';

/** Resumable orders for the left panel. Polls as a fallback when websockets are unavailable. */
export const useOpenOrders = () =>
  useQuery({ queryKey: ['orders', 'open'], queryFn: ordersApi.list, refetchInterval: 15_000 });

/** Admin: every order in every status. */
export const useAllOrders = () =>
  useQuery({ queryKey: ['orders', 'all'], queryFn: ordersApi.listAll, refetchInterval: 30_000 });
