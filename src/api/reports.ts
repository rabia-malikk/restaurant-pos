import type { DashboardData, DashboardRange } from '@/types';
import { http } from './client';

export const reportsApi = {
  dashboard: (range: DashboardRange): Promise<DashboardData> =>
    http.get<DashboardData>('/reports/dashboard', { params: { range } }).then((r) => r.data),
};
