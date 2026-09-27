import { useQuery } from '@tanstack/react-query';

import { HttpUtil } from '@/utils';
import type { PanelRole } from '@/layouts/nav-role';

export interface PanelAccess {
  userId: number;
  role: PanelRole;
  roleKey: string;
  pages: string[];
}

export function usePanelAccess(): PanelAccess {
  const query = useQuery({
    queryKey: ['session', 'access'],
    queryFn: async () => {
      const msg = await HttpUtil.get<{
        id: number;
        username: string;
        role: string;
        roleKey: string;
        pages: string[];
      }>('/panel/api/setting/session', undefined, { silent: true });
      if (!msg.success || !msg.obj) throw new Error(msg.msg || 'Could not load session');
      return {
        userId: msg.obj.id,
        role: msg.obj.role === 'admin' ? 'admin' : 'user',
        roleKey: msg.obj.roleKey,
        pages: msg.obj.pages,
      } as PanelAccess;
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: false,
  });
  if (query.isError) return { userId: 0, role: 'error', roleKey: '', pages: [] };
  if (!query.isSuccess) return { userId: 0, role: 'loading', roleKey: '', pages: [] };
  return query.data;
}

export function usePanelRole(): PanelRole {
  return usePanelAccess().role;
}
