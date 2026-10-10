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

it('retains the last observed node while offline and labels traffic as account totals', async () => {
  vi.spyOn(HttpUtil, 'get').mockImplementation(async (url) => {
    if (url === '/panel/api/clients/myDevices')
      return new Msg(true, '', { ...fullSlots(), onlineIpLimit: 3 });
    if (url === '/panel/api/clients/myUsage?resolution=day')
      return new Msg(true, '', {
        resolution: 'day',
        generatedAt: 1700000000000,
        points: [],
        traffic: {
          recorded: true,
          up: 1024,
          down: 2048,
          total: 3072,
          startedAt: 1700000000000,
          updatedAt: 1700000000000,
          nodes: [
            {
              nodeId: 1,
              nodeName: 'US01',
              up: 1024,
              down: 2048,
              total: 3072,
              startedAt: 1700000000000,
              updatedAt: 1700000000000,
            },
          ],
        },
      });
    return new Msg(true, '', {
      ...onlineSources(),
      onlineSourceCount: 0,
      connections: [],
      lastConnection: { nodeId: 2, nodeName: 'JP', ip: '192.0.*.42', lastSeen: 1700000000000 },
    });
  });
  show();
  await screen.findByText('JP');
  expect(screen.getByText('No active connections')).toBeTruthy();
  expect(screen.getByText('Last observed')).toBeTruthy();
  const traffic = (await screen.findByRole('heading', { name: 'Account traffic' })).closest(
    'section',
  )!;
  expect(within(traffic).getByText('US01')).toBeTruthy();
  expect(within(traffic).getByText('3.00 KB')).toBeTruthy();
  expect(within(traffic).getByText(/Per-device usage is unavailable/)).toBeTruthy();
  expect(within(traffic).queryByText('JP')).toBeNull();
});

it('shows missing traffic as unknown rather than zero', async () => {
  vi.spyOn(HttpUtil, 'get').mockImplementation(async (url) => {
    if (String(url).includes('myUsage')) return new Msg(false, 'Unavailable', null);
    return new Msg(
      true,
      '',
      url === '/panel/api/clients/myDevices' ? fullSlots() : onlineSources(),
    );
  });
  show();
  await screen.findByText('Traffic data is temporarily unavailable. Refresh shortly.');
  const traffic = screen.getByRole('heading', { name: 'Account traffic' }).closest('section')!;
  expect(within(traffic).queryByText('0 B')).toBeNull();
});

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
  const connection = (await screen.findByText('203.0.*.*')).closest('li')!;
  expect(within(connection).getByRole('img', { name: 'Online' })).toBeTruthy();
  expect(within(connection).getByText('主节点')).toBeTruthy();
  expect(within(connection).queryByText('Phone 1')).toBeNull();
  expect(post.mock.calls.some(([url]) => String(url).includes('/setting/'))).toBe(false);
  expect(screen.getByRole('heading', { name: 'Online connections' })).toBeTruthy();
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

it('offers platform-specific subscription formats without exposing hardware details', () => {
  renderWithProviders(
    <SubscriptionDevicePicker
      url="https://example.com/sub/private"
      clashUrl="https://example.com/clash/private"
    />,
  );
  expect(screen.queryByText(/HWID/)).toBeNull();
  expect(screen.getByText('Clash Verge Rev')).toBeTruthy();
  const address = () =>
    (screen.getByRole('textbox', { name: '订阅地址' }) as HTMLInputElement).value;
  expect(address()).toBe('https://example.com/clash/private');
  fireEvent.click(screen.getByRole('button', { name: 'iOS' }));
  expect(screen.getByText('Shadowrocket')).toBeTruthy();
  expect(address()).toBe('https://example.com/sub/private?flag=shadowrocket');
  fireEvent.click(screen.getByRole('button', { name: 'Android' }));
  expect(screen.getByText('v2rayNG')).toBeTruthy();
  expect(address()).toBe('https://example.com/sub/private');
  fireEvent.click(screen.getByRole('button', { name: 'macOS' }));
  expect(screen.getByText('Clash Verge Rev')).toBeTruthy();
  expect(address()).toBe('https://example.com/clash/private');
});

it('shows a compact source row without subscription software or a device slot', async () => {
  const report = {
    ...fullSlots(),
    registered: 0,
    remaining: 3,
    full: false,
    devices: [],
    subscriptionClient: {
      name: 'Shadowrocket',
      version: '2.2.92',
      userAgent: 'Shadowrocket/2.2.92',
      lastIp: '198.51.*.7',
      lastSeen: 1700000000002,
    },
  };
  vi.spyOn(HttpUtil, 'get').mockImplementation(
    async (url) =>
      new Msg(true, '', url === '/panel/api/clients/myDevices' ? report : onlineSources()),
  );
  show();
  const row = (await screen.findByText('203.0.*.*')).closest('li')!;
  expect(within(row).getByText('主节点')).toBeTruthy();
  expect(screen.queryByText('Shadowrocket')).toBeNull();
  expect(screen.getByText('Bound devices').parentElement?.textContent).toContain('0');
  expect(screen.getByText('Available slots').parentElement?.textContent).toContain('3');
  expect(screen.queryByText('Phone 1')).toBeNull();
});

it('keeps native platform clients and hides Clash Mi and Karing', () => {
  renderWithProviders(
    <SubscriptionDevicePicker
      url="https://example.com/sub/private"
      clashUrl="https://example.com/clash/private"
    />,
  );
  for (const [platform, client] of [
    ['Windows', 'v2rayN'],
    ['macOS', 'Shadowrocket'],
    ['Android', 'v2rayNG'],
    ['iOS', 'Shadowrocket'],
  ]) {
    fireEvent.click(screen.getByRole('button', { name: platform }));
    expect(screen.queryByText('Clash Mi')).toBeNull();
    expect(screen.queryByText('Karing')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: client }));
    expect((screen.getByRole('textbox', { name: '订阅地址' }) as HTMLInputElement).value).toBe(
      'https://example.com/sub/private' + (client === 'Shadowrocket' ? '?flag=shadowrocket' : ''),
    );
  }
});

it('hides historical software when no devices are connected', async () => {
  const slots = {
    ...fullSlots(),
    devices: [],
    registered: 0,
    onlineIpLimit: 3,
    subscriptionClient: {
      name: 'Shadowrocket',
      version: '2.2',
      userAgent: 'Shadowrocket/2.2',
      lastIp: '127.0.*.1',
      lastSeen: 1700000000000,
    },
  };
  vi.spyOn(HttpUtil, 'get').mockImplementation(
    async (url) =>
      new Msg(
        true,
        '',
        url === '/panel/api/clients/myDevices'
          ? slots
          : {
              ...onlineSources(),
              connections: [],
              onlineSourceCount: 0,
            },
      ),
  );
  show();
  await screen.findByText('No active connections');
  expect(screen.queryByText('Shadowrocket')).toBeNull();
  expect(await screen.findByText('No active connections')).toBeTruthy();
  expect(screen.queryByText(/Shadowrocket 2/)).toBeNull();
  expect(screen.queryByText(/127\.0/)).toBeNull();
  expect(screen.queryByText(/Collected at/)).toBeNull();
  expect(screen.queryByText(/Latest subscription client/)).toBeNull();
});

it.each(['unavailable', 'partial'])('does not label %s node reports as offline', async (status) => {
  vi.spyOn(HttpUtil, 'get').mockImplementation(
    async (url) =>
      new Msg(
        true,
        '',
        url === '/panel/api/clients/myDevices'
          ? { ...fullSlots(), onlineIpLimit: 3 }
          : {
              ...onlineSources(),
              status,
              connections: [],
              onlineSourceCount: 0,
            },
      ),
  );
  show();
  await screen.findByText('Connection data is incomplete');
  expect(screen.queryByText('No active connections')).toBeNull();
  expect(screen.queryByText('Offline')).toBeNull();
});
