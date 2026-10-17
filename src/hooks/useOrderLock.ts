import { useEffect, useRef } from 'react';
import { ordersApi } from '@/api/orders';
import { LOCK_HEARTBEAT_MS } from '@/config';

/**
 * Keeps the lock on an open order alive. If the server says the lock is gone
 * (expired or force-unlocked by an admin), `onLost` is called so the screen can close the order.
 */
export function useOrderLock(orderId: number | null, onLost: () => void) {
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;

  useEffect(() => {
    if (orderId === null) return;

    const timer = setInterval(() => {
      ordersApi.heartbeat(orderId).catch(() => onLostRef.current());
    }, LOCK_HEARTBEAT_MS);

    return () => clearInterval(timer);
  }, [orderId]);
}
