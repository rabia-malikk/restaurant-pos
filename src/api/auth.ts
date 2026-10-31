import { ApiError } from '@/lib/errors';
import type { User } from '@/types';
import { http } from './client';

export interface AdminSetupStatus {
  adminExists: boolean;
}

export interface CreateInitialAdminPayload {
  username: string;
  name: string;
  password: string;
}

export const authApi = {
  adminSetupStatus: (): Promise<AdminSetupStatus> =>
    http.get<AdminSetupStatus>('/auth/setup-status').then((r) => r.data),

  createInitialAdmin: (payload: CreateInitialAdminPayload): Promise<void> =>
    http.post('/auth/setup-admin', payload).then(() => undefined),

  login: (username: string, password: string, replaceSession = false): Promise<User> =>
    http.post<{ user: User }>('/auth/login', { username, password, replace_session: replaceSession }).then((r) => r.data.user),

  logout: (): Promise<void> =>
    http.post('/auth/logout').then(() => undefined),

  /** Returns the signed-in user, or null when there is no valid session. */
  me: async (): Promise<User | null> => {
    try {
      const res = await http.get<{ user: User }>('/auth/me');
      return res.data.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
};
