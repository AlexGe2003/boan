import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import Orders from '@/pages/business/Orders';
import { makeTestQueryClient } from '@/test/test-utils';
import { HttpUtil, Msg } from '@/utils';

const order = {
  id: 'own-order',
  userId: 2,
  planId: 1,
  planName: 'Standard',
  period: 'monthly',
  durationDays: 30,
  amount: 990,
  currency: 'CNY',
  kind: 'purchase',
  status: 'pending',
  targetExpiry: 0,
  createdAt: 1800000000000,
  expiresAt: 1800001800000,
  paidAt: 0,
  completedAt: 0,
  paidBy: 0,
  paymentNote: '',
  lastError: '',
};
afterEach(() => vi.restoreAllMocks());
it('keeps mobile order actions visible and preserves the row after a failed cancellation', async () => {
  vi.spyOn(HttpUtil, 'get').mockImplementation(async (path: string) => {
    if (path.endsWith('/setting/session'))
      return new Msg(true, '', {
        id: 2,
        username: 'buyer',
        role: 'user',
        roleKey: 'customer',
        pages: ['/my-subscriptions'],
      });
    return new Msg(true, '', { items: [order], total: 1, page: 1 });
  });
  const post = vi
    .spyOn(HttpUtil, 'post')
    .mockResolvedValue(new Msg(false, '订单已经确认，不能取消', null));
  render(
    <QueryClientProvider client={makeTestQueryClient()}>
      <Orders />
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: '取消订单' });
  expect(screen.getByRole('button', { name: '查看详情' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '确认收款并开通' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '取消订单' }));
  fireEvent.click(await screen.findByRole('button', { name: /^OK$/ }));
  await screen.findByText('Error: 订单已经确认，不能取消');
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0][0]).toBe('/panel/api/commerce/orders/own-order/cancel');
  expect(screen.getByText('Standard')).toBeTruthy();
});
