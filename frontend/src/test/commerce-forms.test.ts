import { describe, expect, it } from 'vitest';
import { PlanFormSchema, PlanSchema } from '@/schemas/commerce';
const base = {
  name: 'Standard',
  description: '',
  inboundIds: [],
  nodeGroupIds: [1],
  quotaGB: 100,
  durationDays: 30,
  limitIp: 0,
  limitHwid: 0,
  enabled: true,
  prices: [],
};
describe('commercial plan form boundaries', () => {
  it('accepts groups without direct inbounds and rejects an empty resource selection', () => {
    expect(PlanFormSchema.safeParse(base).success).toBe(true);
    const missing = PlanFormSchema.safeParse({ ...base, nodeGroupIds: [] });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].path).toEqual(['nodeGroupIds']);
  });
  it('rejects duplicate prices, fractional cents and a mismatched duration', () => {
    const price = { period: 'monthly', days: 30, amount: 990 };
    expect(PlanFormSchema.safeParse({ ...base, prices: [price, price] }).success).toBe(false);
    expect(
      PlanFormSchema.safeParse({ ...base, prices: [{ ...price, amount: 990.5 }] }).success,
    ).toBe(false);
    expect(PlanFormSchema.safeParse({ ...base, prices: [{ ...price, days: 365 }] }).success).toBe(
      false,
    );
  });
  it('keeps legacy manual plans without implicitly adding sales or groups', () => {
    const plan = PlanSchema.parse({
      id: 1,
      name: 'Legacy',
      description: '',
      inboundIds: [3],
      totalGB: 1073741824,
      durationDays: 30,
      limitIp: 0,
      limitHwid: 0,
      enabled: true,
    });
    expect(plan.nodeGroupIds).toEqual([]);
    expect(plan.prices).toEqual([]);
  });
});

it('requires a login for new subscribers and a plan when assigning', async () => {
  const { SubscriberFormSchema, SubscriberPasswordSchema } = await import('@/schemas/commerce');
  const subscriber = { username: 'alice', password: 'valid-password', assigning: false };
  expect(SubscriberFormSchema.safeParse(subscriber).success).toBe(true);
  expect(SubscriberFormSchema.safeParse({ ...subscriber, username: '' }).success).toBe(false);
  expect(SubscriberPasswordSchema.safeParse('abcd').success).toBe(false);
  expect(SubscriberPasswordSchema.safeParse('a'.repeat(73)).success).toBe(false);
  expect(SubscriberFormSchema.safeParse({ ...subscriber, assigning: true }).success).toBe(false);
});
