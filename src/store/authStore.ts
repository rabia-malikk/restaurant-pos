import { create } from 'zustand';
import { authApi } from '@/api/auth';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  /** 'loading' until the first /auth/me check finishes. */
  status: 'loading' | 'authed' | 'anon';
  bootstrap: () => Promise<void>;
  login: (username: string, password: string, replaceSession?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  /** Clears local state only (used when the server says the session is gone). */
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: 'loading',

  bootstrap: async () => {
    try {
      const user = await authApi.me();
      set({ user, status: user ? 'authed' : 'anon' });
    } catch {
      set({ user: null, status: 'anon' });
    }
  },

  login: async (username, password, replaceSession) => {
    const user = await authApi.login(username, password, replaceSession);
    set({ user, status: 'authed' });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null, status: 'anon' });
    }
  },

  clear: () => set({ user: null, status: 'anon' }),
}));
