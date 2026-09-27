import { useQuery } from '@tanstack/react-query';
import { HttpUtil } from '@/utils';
export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  inboundIds: number[];
  totalGB: number;
  durationDays: number;
  limitIp: number;
  limitHwid: number;
  enabled: boolean;
}
export const planQueryKey = ['subscription-plans'];
export function useSubscriptionPlans(enabled = true) {
  return useQuery({
    queryKey: planQueryKey,
    enabled,
    queryFn: async () => {
      const result = await HttpUtil.get<SubscriptionPlan[]>(
        '/panel/api/subscription-plans',
        undefined,
        { silent: true },
      );
      if (!result.success) throw new Error(result.msg);
      return result.obj || [];
    },
  });
}
export async function postPlan<T = unknown>(path: string, body: unknown) {
  return HttpUtil.post<T>(`/panel/api/subscription-plans/${path}`, body, {
    headers: { 'Content-Type': 'application/json' },
    silent: true,
  });
}
export function planSummary(p: SubscriptionPlan) {
  return `${p.totalGB ? `${p.totalGB / 1073741824} GB` : '不限流量'} · ${p.durationDays ? `${p.durationDays} 天` : '长期有效'} · ${p.inboundIds.length} 个节点入站`;
}

export function usePlanAssignments(enabled: boolean) {
  return useQuery({
    queryKey: ['subscription-plan-assignments'],
    enabled,
    queryFn: async () => {
      const result = await HttpUtil.get<{ email: string; planId: number; name: string }[]>(
        '/panel/api/subscription-plans/assignments',
        undefined,
        { silent: true },
      );
      if (!result.success) throw new Error(result.msg);
      return Object.fromEntries((result.obj || []).map((row) => [row.email, row.name]));
    },
  });
}
