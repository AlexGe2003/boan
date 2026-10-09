import { z } from 'zod';

export const periodDays = {
  monthly: 30,
  quarterly: 90,
  half_yearly: 180,
  yearly: 365,
  two_yearly: 730,
  three_yearly: 1095,
  onetime: 0,
} as const;
export const periodLabels: Record<keyof typeof periodDays, string> = {
  monthly: '月付',
  quarterly: '季付',
  half_yearly: '半年付',
  yearly: '年付',
  two_yearly: '两年付',
  three_yearly: '三年付',
  onetime: '一次性（长期）',
};
export const PriceSchema = z
  .object({
    period: z.enum([
      'monthly',
      'quarterly',
      'half_yearly',
      'yearly',
      'two_yearly',
      'three_yearly',
      'onetime',
    ]),
    days: z.number().int().nonnegative(),
    amount: z.number().int().min(1).max(100000000),
  })
  .refine((p) => p.days === periodDays[p.period], {
    path: ['days'],
    message: '周期与有效天数不匹配',
  });
export const PlanSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string(),
  inboundIds: z.array(z.number().int()),
  nodeGroupIds: z.array(z.number().int()).default([]),
  prices: z.array(PriceSchema).default([]),
  totalGB: z.number(),
  durationDays: z.number().int(),
  limitIp: z.number().int(),
  limitHwid: z.number().int(),
  enabled: z.boolean(),
});
export const NodeGroupSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string(),
  inboundIds: z.array(z.number().int()),
  planCount: z.number().int(),
});
export const GroupFormSchema = z.object({
  name: z.string().trim().min(1, '请输入分组名称').max(40),
  description: z.string().max(1000),
  inboundIds: z.array(z.number().int().positive()).min(1, '请选择节点入站').max(500),
});
export const PlanFormSchema = z
  .object({
    name: z.string().trim().min(1, '请输入套餐名称').max(40),
    description: z.string().max(1000),
    inboundIds: z.array(z.number().int().positive()).max(500),
    nodeGroupIds: z.array(z.number().int().positive()).max(100),
    quotaGB: z.number().min(0).max(1000000),
    durationDays: z.number().int().min(0).max(36500),
    limitIp: z.number().int().nonnegative(),
    limitHwid: z.number().int().nonnegative(),
    enabled: z.boolean(),
    prices: z.array(PriceSchema),
  })
  .refine((p) => p.inboundIds.length + p.nodeGroupIds.length > 0, {
    path: ['nodeGroupIds'],
    message: '请选择节点分组或直接选择入站',
  })
  .refine((p) => new Set(p.prices.map((v) => v.period)).size === p.prices.length, {
    path: ['prices'],
    message: '购买价格不能包含重复周期',
  });
export const OrderSchema = z.object({
  id: z.string(),
  userId: z.number().int(),
  planId: z.number().int(),
  planName: z.string(),
  period: z.string(),
  durationDays: z.number().int(),
  amount: z.number().int(),
  currency: z.string(),
  kind: z.string(),
  status: z.enum(['pending', 'paid', 'failed', 'completed', 'cancelled', 'expired']),
  targetExpiry: z.number(),
  createdAt: z.number(),
  expiresAt: z.number(),
  paidAt: z.number(),
  completedAt: z.number(),
  paidBy: z.number(),
  paymentNote: z.string(),
  lastError: z.string(),
});
export const OrdersSchema = z.object({
  items: z.array(OrderSchema),
  total: z.number().int(),
  page: z.number().int(),
});
export const StorePlanSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string(),
  totalGB: z.number(),
  nodeCount: z.number().int(),
  limitIp: z.number().int(),
  limitHwid: z.number().int(),
  prices: z.array(PriceSchema),
});
export type Plan = z.infer<typeof PlanSchema>;
export type PlanValues = z.infer<typeof PlanFormSchema>;
export type NodeGroup = z.infer<typeof NodeGroupSchema>;
export type GroupValues = z.infer<typeof GroupFormSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type StorePlan = z.infer<typeof StorePlanSchema>;
export function money(amount: number) {
  return `¥${(amount / 100).toFixed(2)}`;
}
export function periodName(period: string) {
  return periodLabels[period as keyof typeof periodLabels] || period;
}

export const SubscriberPasswordSchema = z
  .string()
  .refine(
    (value) =>
      value === 'user' ||
      (new TextEncoder().encode(value).length >= 8 && new TextEncoder().encode(value).length <= 72),
    { message: '使用默认密码 user，或设置 8–72 字节的密码' },
  );
export const SubscriberFormSchema = z
  .object({
    username: z.string().trim().max(120),
    password: SubscriberPasswordSchema,
    planId: z.number().int().nonnegative().optional(),
    assigning: z.boolean(),
  })
  .refine((value) => value.assigning || value.username.length > 0, {
    path: ['username'],
    message: '请输入登录账号',
  })
  .refine(
    (value) =>
      value.assigning || value.username === '' || /^[^\s/\\\p{Cc}]+$/u.test(value.username),
    { path: ['username'], message: '账号不能包含空格或斜线' },
  )
  .refine((value) => !value.assigning || (value.planId !== undefined && value.planId > 0), {
    path: ['planId'],
    message: '请选择套餐',
  });
export const subscriberDefaults = {
  username: '',
  password: 'user',
  planId: undefined,
  assigning: false,
};
export type SubscriberValues = z.infer<typeof SubscriberFormSchema>;
