import { ApiError } from '@/lib/errors';
import type { User } from '@/types';
import { http } from './client';

export const authApi = {
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
