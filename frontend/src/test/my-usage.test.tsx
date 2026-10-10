import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import MyUsage, { UsageBars } from '@/pages/subscriptions/MyUsage';
import MySubscriptionsPage from '@/pages/subscriptions/MySubscriptionsPage';
import type { ClientUsageView } from '@/generated/zod';
import { HttpUtil, Msg } from '@/utils';
import { renderWithProviders } from './test-utils';

afterEach(() => vi.restoreAllMocks());
const now = Date.UTC(2026, 9, 8, 16, 30);
function usage(resolution = 'day'): ClientUsageView {
  return {
    resolution,
    generatedAt: now,
    traffic: {
      recorded: true,
      up: 1024,
      down: 2048,
      total: 3072,
      startedAt: now,
      updatedAt: now,
      nodes: [
        {
          nodeId: 0,
          nodeName: '主节点',
          up: 1024,
          down: 2048,
          total: 3072,
          startedAt: now,
          updatedAt: now,
        },
      ],
    },
    points: [
      {
        nodeId: 0,
        bucket: Date.UTC(2026, 9, 8, resolution === 'hour' ? 16 : 0),
        up: 1024,
        down: 2048,
      },
    ],
  };
}
function mockUsage() {
  return vi
    .spyOn(HttpUtil, 'get')
    .mockImplementation(
      async (url) => new Msg(true, '', usage(url.includes('resolution=hour') ? 'hour' : 'day')),
    );
}
it('loads own usage and changes the requested resolution', async () => {
  const get = mockUsage();
  renderWithProviders(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <MyUsage userId={7} />
    </ConfigProvider>,
  );
  const daily = await screen.findByRole('list', { name: '近 30 天流量' });
  expect(within(daily).getAllByRole('listitem')).toHaveLength(30);
  expect(within(daily).getAllByRole('button', { name: /无采集记录/ })).toHaveLength(29);
  expect(within(daily).getByRole('button', { name: /上传 1\.00 KB，下载 2\.00 KB/ })).toBeTruthy();
  fireEvent.click(screen.getByText('按小时'));
  const hourly = await screen.findByRole('list', { name: '近 24 小时流量' });
  expect(within(hourly).getAllByRole('listitem')).toHaveLength(24);
  expect(get.mock.calls.map(([url]) => url)).toEqual([
    '/panel/api/clients/myUsage?resolution=day',
    '/panel/api/clients/myUsage?resolution=hour',
  ]);
});
it('does not fabricate historical bars before sampling starts', () => {
  renderWithProviders(<UsageBars points={[]} generatedAt={now} hourly={false} />);
  expect(screen.getByText('尚未采集到分时流量')).toBeTruthy();
  expect(screen.queryByRole('listitem')).toBeNull();
});
it('shows traffic records without visited sites', async () => {
  mockUsage();
  renderWithProviders(<MyUsage userId={7} records />);
  await screen.findByRole('columnheader', { name: '时间（UTC）' });
  expect(screen.getByRole('columnheader', { name: '上传' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: '下载' })).toBeTruthy();
  expect(screen.getByText('主节点')).toBeTruthy();
  expect(screen.queryByText('站点')).toBeNull();
});
it('keeps sites hidden and treats the sites hash as overview', async () => {
  const get = vi.spyOn(HttpUtil, 'get').mockImplementation(async (url) => {
    if (url === '/panel/api/setting/session')
      return new Msg(true, '', {
        id: 7,
        role: 'customer',
        roleKey: 'customer',
        pages: ['mySubscriptions'],
      });
    if (url === '/panel/api/clients/mySubscriptions') return new Msg(true, '', []);
    if (url.startsWith('/panel/api/clients/myUsage')) return new Msg(true, '', usage());
    throw new Error(`Unexpected request: ${url}`);
  });
  renderWithProviders(
    <MemoryRouter initialEntries={['/panel/mySubscriptions#sites']}>
      <MySubscriptionsPage />
    </MemoryRouter>,
  );
  const tabs = await screen.findByRole('navigation', { name: '账户视图' });
  expect(within(tabs).getByRole('button', { name: '概览' }).getAttribute('aria-current')).toBe(
    'page',
  );
  expect(
    within(tabs)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['概览', '订阅', '用量', '设备', '更多']);
  expect(screen.queryByRole('button', { name: '站点' })).toBeNull();
  fireEvent.click(within(tabs).getByRole('button', { name: '用量' }));
  await screen.findByRole('list', { name: '近 30 天流量' });
  await waitFor(() =>
    expect(within(tabs).getByRole('button', { name: '用量' }).getAttribute('aria-current')).toBe(
      'page',
    ),
  );
  expect(get.mock.calls.some(([url]) => /activity|destinations|\/devices\//.test(url))).toBe(false);
});
