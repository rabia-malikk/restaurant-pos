import { USE_MOCK } from '@/config';
import type { DashboardData, DashboardRange } from '@/types';
import { http } from './client';
import { mock } from './mockDb';

export const reportsApi = {
  dashboard: (range: DashboardRange): Promise<DashboardData> =>
    USE_MOCK
      ? mock.dashboard(range)
      : http.get<DashboardData>('/reports/dashboard', { params: { range } }).then((r) => r.data),
};
