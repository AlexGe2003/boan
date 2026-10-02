import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import ClientActivity from '@/pages/clients/ClientActivity';
import { makeTestQueryClient } from '@/test/test-utils';
import { HttpUtil, Msg } from '@/utils';

afterEach(() => vi.restoreAllMocks());

it('explains missing collection instead of reporting zero website usage', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(
    new Msg(true, '', {
      status: 'disabled',
      sampled: false,
      demo: false,
      since: 0,
      generatedAt: 0,
      connections: 0,
      destinations: [],
      categories: [],
      recent: [],
      visits: [],
    }),
  );
  render(
    <QueryClientProvider client={makeTestQueryClient()}>
      <ClientActivity email="alice@example.com" />
    </QueryClientProvider>,
  );
  await screen.findByText('尚未开启访问日志');
  expect(screen.queryByText('采样连接记录')).toBeNull();
  expect(HttpUtil.get).toHaveBeenCalledWith(
    '/panel/api/clients/activity/alice%40example.com?hours=24',
  );
});

it('reports a denied request without inventing visit statistics', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(false, 'Forbidden', null));
  render(
    <QueryClientProvider client={makeTestQueryClient()}>
      <ClientActivity email="alice" />
    </QueryClientProvider>,
  );
  await screen.findByText('Error: Forbidden');
  expect(screen.queryByText('网站 / 目标排行 · 最多 50 项')).toBeNull();
});
