// Runtime configuration, read from Vite env variables (see .env.example).

export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';
export const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL ?? '';
export const CURRENCY: string = import.meta.env.VITE_CURRENCY ?? 'PKR';
export const TAX_PERCENT = Number(import.meta.env.VITE_TAX_PERCENT ?? 0);

/** How often an open order's lock is renewed. The server expires locks after ~5 minutes. */
export const LOCK_HEARTBEAT_MS = 60_000;
