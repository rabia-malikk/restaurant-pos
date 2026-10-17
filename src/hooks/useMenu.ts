import { useQuery } from '@tanstack/react-query';
import { menuApi } from '@/api/menu';

export const useMenu = () =>
  useQuery({ queryKey: ['menu'], queryFn: menuApi.get, staleTime: 5 * 60_000 });
