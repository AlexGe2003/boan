import { z } from 'zod';

export const UsageControlFormSchema = z.object({
  quotaGB: z.number().min(0, '额度不能为负数').max(1000000),
  basis: z.enum(['proxy', 'billing']),
  adjustUsage: z.boolean(),
  usedGB: z.number().min(0, '已用量不能为负数').max(1000000),
});

export const UsageControlTargetSchema = z.object({
  nodeId: z.number().int().nonnegative(),
  email: z.string().optional(),
  name: z.string(),
  used: z.number().nonnegative(),
  restoreUsed: z.number().nonnegative(),
  quota: z.number().nonnegative(),
  basis: z.string(),
});
export type UsageControlTarget = z.infer<typeof UsageControlTargetSchema>;
export type UsageControlFormValues = z.infer<typeof UsageControlFormSchema>;
