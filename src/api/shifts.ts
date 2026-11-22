import type { ShiftStatus } from '@/types';
import { http } from './client';

export const shiftsApi = {
  current: (): Promise<ShiftStatus> => http.get<ShiftStatus>('/shifts/me').then((r) => r.data),

  start: (): Promise<ShiftStatus> => http.post<ShiftStatus>('/shifts/start').then((r) => r.data),

  end: (): Promise<{ ended: number }> => http.post<{ ended: number }>('/shifts/end').then((r) => r.data),
};
