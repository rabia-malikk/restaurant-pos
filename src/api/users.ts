import { USE_MOCK } from '@/config';
import type { User } from '@/types';
import { http } from './client';
import { mock } from './mockDb';

export const usersApi = {
  list: (): Promise<User[]> =>
    USE_MOCK ? mock.listUsers() : http.get<User[]>('/users').then((r) => r.data),
};
