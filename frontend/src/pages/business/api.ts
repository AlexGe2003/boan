import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { HttpUtil } from '@/utils';
import { NodeGroupSchema, OrdersSchema, StorePlanSchema } from '@/schemas/commerce';
import { usePanelAccess } from '@/api/queries/usePanelRole';
import type { InboundOption } from '@/hooks/useClients';

export async function businessGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, string | number>,
) {
  const result = await HttpUtil.get<unknown>('/panel/api/' + path, params, { silent: true });
  if (!result.success) throw new Error(result.msg || '加载失败');
  return schema.parse(result.obj);
}
export async function businessPost(path: string, body: unknown) {
  const result = await HttpUtil.post('/panel/api/' + path, body, {
    headers: { 'Content-Type': 'application/json' },
    silent: true,
  });
  if (!result.success) throw new Error(result.msg || '操作失败');
  return result.obj;
}
export function useNodeGroups() {
  return useQuery({
    queryKey: ['node-groups'],
    queryFn: () => businessGet('node-groups', z.array(NodeGroupSchema)),
  });
}
export function useInboundOptions() {
  return useQuery({
    queryKey: ['plan-inbound-options'],
    queryFn: async () => {
      const result = await HttpUtil.get<InboundOption[]>('/panel/api/inbounds/options', undefined, {
        silent: true,
      });
      if (!result.success) throw new Error(result.msg);
      return result.obj || [];
    },
  });
}
export function useOrders(page: number, status: string) {
  const access = usePanelAccess();
  return useQuery({
    queryKey: ['commerce-orders', access.userId, page, status],
    queryFn: () => businessGet('commerce/orders', OrdersSchema, { page, status }),
    refetchInterval: 30000,
  });
}
export function useStorePlans() {
  return useQuery({
    queryKey: ['store-plans'],
    queryFn: () => businessGet('commerce/plans', z.array(StorePlanSchema)),
  });
}
