import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, expect, it, vi } from 'vitest';
import MyDevices from '@/pages/subscriptions/MyDevices';
import SubscriptionDevicePicker from '@/pages/subscriptions/SubscriptionDevicePicker';
import type { ClientDeviceSlots } from '@/generated/zod';
import { HttpUtil, Msg } from '@/utils';
import { renderWithProviders } from './test-utils';

afterEach(() => vi.restoreAllMocks());

function fullSlots(): ClientDeviceSlots {
  return {
    registered: 3,
    limit: 3,
    remaining: 0,
    full: true,
    devices: [1, 2, 3].map((id) => ({
      id,
      deviceModel: `Phone ${id}`,
      deviceOs: 'iOS',
      osVersion: '18',
      fingerprint: `device${id}`,
      userAgent: 'HWID client',
      lastIp: '192.0.*.*',
      firstSeen: 1700000000000,
      lastSeen: 1700000000001,
    })),
  };
}

function onlineSources() {
  return {
    status: 'ready',
    onlineSourceCount: 1,
    generatedAt: 1700000000000,
    sources: [{ nodeId: 0, name: '主节点', status: 'ready' }],
    connections: [{ nodeId: 0, nodeName: '主节点', ip: '203.0.*.*', lastSeen: 1700000000000 }],
  };
}

function show() {
  renderWithProviders(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <MyDevices userId={7} />
    </ConfigProvider>,
  );
}

it('shows full slots, confirms an unbind and refreshes the released slot', async () => {
  let report = fullSlots();
  const post = vi.spyOn(HttpUtil, 'post');
  const get = vi
    .spyOn(HttpUtil, 'get')
    .mockImplementation(
      async (url) =>
        new Msg(true, '', url === '/panel/api/clients/myDevices' ? report : onlineSources()),
    );
  const remove = vi.spyOn(HttpUtil, 'delete').mockImplementation(async () => {
    report = {
      ...report,
      devices: report.devices.slice(1),
      registered: 2,
      remaining: 1,
      full: false,
    };
    return new Msg(true, '', { deleted: 1 });
  });
  show();
  await screen.findByText('Phone 1');
  expect(
    screen.getByText('All device slots are occupied. Unbind a device before adding another.'),
  ).toBeTruthy();
  expect(screen.getAllByText('192.0.*.*')).toHaveLength(3);
  await screen.findByText('203.0.*.*');
  expect(post.mock.calls.some(([url]) => String(url).includes('/setting/'))).toBe(false);
  expect(screen.getByRole('heading', { name: '在线来源 IP · 1 个' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Unbind Phone 1' }));
  expect(remove).not.toHaveBeenCalled();
  const first = await screen.findByRole('tooltip');
  fireEvent.click(within(first).getByRole('button', { name: 'Cancel' }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Unbind Phone 1' }));
  const confirm = await screen.findByRole('tooltip');
  fireEvent.click(within(confirm).getByRole('button', { name: 'Unbind' }));
  await waitFor(() =>
    expect(remove).toHaveBeenCalledExactlyOnceWith('/panel/api/clients/myDevices/1', {
      silent: true,
    }),
  );
  await waitFor(() => expect(screen.queryByText('Phone 1')).toBeNull());
  expect(screen.getByText('Available slots').parentElement?.textContent).toContain('1');
  expect(
    screen.queryByText('All device slots are occupied. Unbind a device before adding another.'),
  ).toBeNull();
  expect(get.mock.calls.filter(([url]) => url === '/panel/api/clients/myDevices')).toHaveLength(2);
});

it('keeps occupied slots visible when unbinding fails', async () => {
  vi.spyOn(HttpUtil, 'get').mockImplementation(
    async (url) =>
      new Msg(true, '', url === '/panel/api/clients/myDevices' ? fullSlots() : onlineSources()),
  );
  vi.spyOn(HttpUtil, 'delete').mockResolvedValue(
    new Msg(false, 'Device could not be removed', null),
  );
  show();
  await screen.findByText('Phone 1');
  fireEvent.click(screen.getByRole('button', { name: 'Unbind Phone 1' }));
  const confirm = await screen.findByRole('tooltip');
  fireEvent.click(within(confirm).getByRole('button', { name: 'Unbind' }));
  await screen.findByText('Device could not be removed');
  expect(screen.getByText('Phone 1')).toBeTruthy();
  expect(screen.getByText('Available slots').parentElement?.textContent).toContain('0');
});

it('directs a limited subscription to HWID import rather than ordinary Clash import', () => {
  renderWithProviders(
    <SubscriptionDevicePicker
      url="https://example.com/sub/private"
      clashUrl="https://example.com/clash/private"
      hwidRequired
    />,
  );
  expect(screen.getByText('此套餐需要设备绑定')).toBeTruthy();
  expect(screen.queryByText('Clash Verge Rev')).toBeNull();
  expect(screen.queryByRole('button', { name: '一键导入到客户端' })).toBeNull();
  expect((screen.getByRole('textbox', { name: '订阅地址' }) as HTMLInputElement).value).toBe(
    'https://example.com/sub/private',
  );
  expect(screen.getByRole('button', { name: /复制订阅链接/ })).toBeTruthy();
});
