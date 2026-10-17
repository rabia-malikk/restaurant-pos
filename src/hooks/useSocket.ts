import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { SOCKET_URL, USE_MOCK } from '@/config';
import { useAuthStore } from '@/store/authStore';

/**
 * Listens for realtime events and refreshes the affected queries.
 * Events: order:locked, order:unlocked, order:updated, menu:updated.
 * Not used in mock mode (there is no server to push events).
 */
export function useSocket() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (USE_MOCK || !user) return;

    const socket = io(SOCKET_URL || window.location.origin, { withCredentials: true });
    const refreshOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

    socket.on('order:locked', refreshOrders);
    socket.on('order:unlocked', refreshOrders);
    socket.on('order:updated', refreshOrders);
    socket.on('menu:updated', () => queryClient.invalidateQueries({ queryKey: ['menu'] }));

    return () => {
      socket.disconnect();
    };
  }, [user, queryClient]);
}
