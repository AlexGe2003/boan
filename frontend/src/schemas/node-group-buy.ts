import { z } from 'zod';

export const NodeGroupBuyFormSchema = z
  .object({
    groupName: z.string().trim().max(60),
    provider: z.string().trim().max(60),
    region: z.string().trim().max(60),
    monthlyPrice: z.number().min(0).max(10000000),
    expiresAt: z.number().int().min(0).max(4102444800000),
    bandwidthMbps: z.number().int().min(0).max(10000000),
    bandwidthMode: z.enum(['shared', 'dedicated']),
    trafficGB: z.number().min(0).max(1000000),
    memberCount: z.number().int().min(0).max(100000),
    feeMode: z.enum(['fixed', 'percent']),
    feeValue: z.number().min(0).max(10000000),
    notes: z.string().max(1000),
  })
  .refine((v) => v.feeMode !== 'percent' || v.feeValue <= 100, {
    path: ['feeValue'],
    message: '手续费比例不能超过 100%',
  });
export type NodeGroupBuyFormValues = z.infer<typeof NodeGroupBuyFormSchema>;
