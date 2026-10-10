import { fireEvent, render, screen } from '@testing-library/react';
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
  expect(screen.queryByText('当前范围连接次数')).toBeNull();
  expect(HttpUtil.get).toHaveBeenCalledWith(
    '/panel/api/clients/activity/alice%40example.com?hours=24&scope=web&nodeId=-1',
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
  expect(screen.queryByText('访问目标排行 · 最多 50 项')).toBeNull();
});

it('starts with websites and requests network statistics when switching scope', async () => {
  const get = vi.spyOn(HttpUtil, 'get').mockImplementation(async (url) => {
    const network = String(url).includes('scope=network');
    const host = network ? '1.1.1.1' : 'chatgpt.com';
    const category = network ? 'DNS / 解析服务' : 'AI 服务';
    return new Msg(true, '', {
      status: 'ready',
      sampled: false,
      demo: false,
      since: 0,
      generatedAt: 0,
      connections: 1,
      destinations: [{ host, category, count: 1, lastSeen: 0 }],
      categories: [{ name: category, count: 1 }],
      recent: [],
      visits: [],
    });
  });
  render(
    <QueryClientProvider client={makeTestQueryClient()}>
      <ClientActivity email="alice" />
    </QueryClientProvider>,
  );
  await screen.findByText('chatgpt.com');
  expect(screen.queryByText('1.1.1.1')).toBeNull();
  fireEvent.click(screen.getByText('DNS / IP 连接'));
  await screen.findByText('1.1.1.1');
  expect(screen.queryByText('chatgpt.com')).toBeNull();
  expect(get).toHaveBeenLastCalledWith(
    '/panel/api/clients/activity/alice?hours=24&scope=network&nodeId=-1',
  );
});
