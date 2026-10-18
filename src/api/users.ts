import type { CreateUserPayload, UpdateUserPayload, User, UserCapacity } from '@/types';
import { http } from './client';

export const usersApi = {
  list: (): Promise<User[]> =>
    http.get<User[]>('/users').then((r) => r.data),

  capacity: async (): Promise<UserCapacity> => {
    const capacity = (await http.get<UserCapacity>('/users/capacity')).data;
    if (
      !capacity ||
      !Number.isInteger(capacity.active_users) ||
      capacity.active_users < 0 ||
      !Number.isInteger(capacity.max_users) ||
      capacity.max_users < -1 ||
      !Number.isInteger(capacity.active_admins) ||
      capacity.active_admins < 0 ||
      !Number.isInteger(capacity.max_admins) ||
      capacity.max_admins < -1 ||
      !Number.isInteger(capacity.active_staff) ||
      capacity.active_staff < 0 ||
      !Number.isInteger(capacity.max_staff) ||
      capacity.max_staff < -1
    ) {
      throw new Error('The server returned invalid user capacity data.');
    }
    return capacity;
  },

  create: (payload: CreateUserPayload): Promise<User> =>
    http.post<User>('/users', payload).then((r) => r.data),

  update: (id: number, payload: UpdateUserPayload): Promise<User> =>
    http.patch<User>(`/users/${id}`, payload).then((r) => r.data),

  delete: (id: number): Promise<void> =>
    http.delete(`/users/${id}`).then(() => undefined),
};
