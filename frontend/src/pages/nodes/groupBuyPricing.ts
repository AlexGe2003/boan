import type { z } from 'zod';
import type { NodeGroupBuyItemSchema } from '@/generated/zod';

export const groupBuyMoney = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

export function groupBuyQuote(price: number, feeMode: string, feeValue: number, members: number) {
  if (
    ![price, feeValue, members].every(Number.isFinite) ||
    price < 0 ||
    price > 10000000 ||
    feeValue < 0 ||
    feeValue > (feeMode === 'percent' ? 100 : 10000000) ||
    members < 0 ||
    members > 100000 ||
    !Number.isInteger(members)
  )
    return null;
  const cost = Math.round(price * 100);
  const fee =
    feeMode === 'percent'
      ? Math.ceil((cost * Math.round(feeValue * 100)) / 10000)
      : Math.round(feeValue * 100);
  const total = cost + fee;
  return { cost, fee, total, perMember: members > 0 ? Math.ceil(total / members) : null };
}

export type GroupBuySort = 'expiry' | 'cost' | 'fee' | 'perMember';
export function sortGroupBuyNodes(
  rows: z.infer<typeof NodeGroupBuyItemSchema>[],
  sort: GroupBuySort,
) {
  const priority: Record<string, number> = { expired: 0, soon: 1, active: 2, unset: 3 };
  return [...rows].sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? -1 : 1;
    if (sort === 'cost')
      return b.config.monthlyPrice - a.config.monthlyPrice || a.nodeId - b.nodeId;
    if (sort === 'fee') return b.monthlyFee - a.monthlyFee || a.nodeId - b.nodeId;
    if (sort === 'perMember') return b.perMember - a.perMember || a.nodeId - b.nodeId;
    return (
      (priority[a.expiryStatus] ?? 3) - (priority[b.expiryStatus] ?? 3) ||
      a.config.expiresAt - b.config.expiresAt ||
      a.nodeId - b.nodeId
    );
  });
}
