import { USE_MOCK } from '@/config';
import { ApiError } from '@/lib/errors';
import type { User } from '@/types';
import { http } from './client';
import { mock } from './mockDb';

export const authApi = {
  login: (username: string, password: string): Promise<User> =>
    USE_MOCK
      ? mock.login(username, password)
      : http.post<{ user: User }>('/auth/login', { username, password }).then((r) => r.data.user),

  logout: (): Promise<void> =>
    USE_MOCK ? mock.logout() : http.post('/auth/logout').then(() => undefined),

  /** Returns the signed-in user, or null when there is no valid session. */
  me: async (): Promise<User | null> => {
    if (USE_MOCK) return mock.me();
    try {
      const res = await http.get<{ user: User }>('/auth/me');
      return res.data.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
};
