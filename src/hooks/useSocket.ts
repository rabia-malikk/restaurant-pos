import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '@/config';
import { useNotify } from '@/context/NotifyContext';
import { useAuthStore } from '@/store/authStore';

/**
 * Listens for realtime events and refreshes the affected queries.
 * Events: order:locked, order:unlocked, order:updated, menu:updated.
 */
export function useSocket() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    const socket = io(SOCKET_URL || window.location.origin, { withCredentials: true });
    const refreshOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

    socket.on('order:locked', refreshOrders);
    socket.on('order:unlocked', refreshOrders);
    socket.on('order:updated', refreshOrders);
    socket.on('menu:updated', () => queryClient.invalidateQueries({ queryKey: ['menu'] }));
    socket.on('permissions:updated', () => {
      void useAuthStore.getState().bootstrap();
    });
    socket.on('session:revoked', () => {
      useAuthStore.getState().clear();
      queryClient.clear();
      notify('You were signed out because this account signed in on another device.', 'warning');
    });

    return () => {
      socket.disconnect();
    };
  }, [user, queryClient, notify]);
}
