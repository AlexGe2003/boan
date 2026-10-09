import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import ClientDevices from '@/pages/clients/ClientDevices';
import ClientInfoModal from '@/pages/clients/ClientInfoModal';
import { makeTestQueryClient } from '@/test/test-utils';
import { HttpUtil, Msg } from '@/utils';
import type { ClientDeviceReport } from '@/generated/zod';

afterEach(() => vi.restoreAllMocks());

const report: ClientDeviceReport = {
  registered: 1,
  limit: 2,
  traffic: {
    recorded: true,
    up: 3145728,
    down: 6291456,
    total: 9437184,
    startedAt: 1700000000000,
    updatedAt: 1700000000002,
    nodes: [
      {
        nodeId: 1,
        nodeName: 'Traffic HK',
        up: 1048576,
        down: 2097152,
        total: 3145728,
        startedAt: 1700000000000,
        updatedAt: 1700000000002,
      },
      {
        nodeId: 0,
        nodeName: '',
        up: 2097152,
        down: 4194304,
        total: 6291456,
        startedAt: 1700000000001,
        updatedAt: 1700000000001,
      },
    ],
  },
  devices: [
    {
      id: 1,
      deviceModel: 'Alice phone',
      deviceOs: 'iOS',
      osVersion: '18',
      userAgent: 'Happ/1.0',
      fingerprint: '0123456789ab',
      lastIp: '192.0.*.*',
      firstSeen: 1700000000000,
      lastSeen: 1700000000001,
    },
  ],
  connections: {
    status: 'ready',
    generatedAt: 1700000000002,
    onlineSourceCount: 1,
    sources: [{ nodeId: 1, name: 'HK', status: 'ready' }],
    connections: [{ ip: '203.0.*.42', nodeId: 1, nodeName: 'HK', lastSeen: 1700000000002 }],
  },
};

function show() {
  return render(
    <QueryClientProvider client={makeTestQueryClient()}>
      <ClientDevices email="alice@example.com" />
    </QueryClientProvider>,
  );
}

it('keeps device identity separate from source addresses even when they share an IP', async () => {
  const get = vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, '', report));
  show();
  await screen.findByText('Alice phone');
  expect(get).toHaveBeenCalledWith('/panel/api/clients/devices/alice%40example.com', undefined, {
    silent: true,
  });
  expect(screen.getByText('192.0.*.*')).toBeTruthy();
  expect(screen.getByText('Alice phone').closest('tr')?.textContent).not.toContain('Online');
  const connection = screen.getByText('203.0.*.42').closest('tr')!;
  expect(within(connection).getByText('alice@example.com')).toBeTruthy();
  expect(within(connection).getByText('HK')).toBeTruthy();
  expect(within(connection).queryByText('Alice phone')).toBeNull();
  expect(screen.getByText('Online · device unidentified')).toBeTruthy();
  expect(
    screen.getByRole('switch', { name: 'Refresh every 15 seconds' }).getAttribute('aria-checked'),
  ).toBe('true');
  const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
  expect(headings.indexOf('Online connections')).toBeLessThan(
    headings.indexOf('Identified devices'),
  );
  expect(screen.getByText('Source IPs are not a device count')).toBeTruthy();
});

it('does not turn failed collection or missing identifiers into zero online devices', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(
    new Msg(true, '', {
      ...report,
      devices: [],
      registered: 0,
      connections: {
        ...report.connections,
        status: 'unavailable',
        onlineSourceCount: 0,
        connections: [],
        sources: [{ nodeId: 1, name: 'HK', status: 'unavailable' }],
      },
    }),
  );
  show();
  await screen.findByText('Online connections could not be collected');
  expect(screen.getByText('Online source IPs').parentElement?.textContent).toContain('Unknown');
  expect(
    screen.getByText(
      'No device identifiers reported yet. This does not mean that no devices are in use.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('No online source IPs on the queried nodes')).toBeNull();
});

it('shows a lower bound when some nodes are unavailable', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(
    new Msg(true, '', {
      ...report,
      connections: { ...report.connections, status: 'partial' },
    }),
  );
  show();
  await screen.findByText('At least 1');
  expect(screen.getByText('Some nodes could not be queried')).toBeTruthy();
});

it('shows user upload/download totals and node breakdown even if online collection fails', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(
    new Msg(true, '', {
      ...report,
      connections: { ...report.connections, status: 'unavailable', connections: [] },
    }),
  );
  show();
  await screen.findByText('Traffic HK');
  expect(screen.getAllByText('User outbound (upload)')[0].parentElement?.textContent).toContain(
    '3.00 MB',
  );
  expect(screen.getAllByText('User inbound (download)')[0].parentElement?.textContent).toContain(
    '6.00 MB',
  );
  expect(screen.getAllByText('Total traffic')[0].parentElement?.textContent).toContain('9.00 MB');
  const row = screen.getByText('Traffic HK').closest('tr')!;
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
      .slice(0, 4),
  ).toEqual(['Traffic HK', '1.00 MB', '2.00 MB', '3.00 MB']);
  expect(screen.getByText('Local server')).toBeTruthy();
});

it('does not display missing traffic records as zero bytes', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(
    new Msg(true, '', {
      ...report,
      traffic: { recorded: false, up: 0, down: 0, total: 0, startedAt: 0, updatedAt: 0, nodes: [] },
    }),
  );
  show();
  await screen.findByText('No traffic has been recorded yet. Usage is unknown.');
  expect(screen.getAllByText('User outbound (upload)')[0].parentElement?.textContent).toContain(
    'Unknown',
  );
  expect(screen.queryByText('0 B')).toBeNull();
});

it('reports rejected access without showing device or online counters', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(false, 'Forbidden', null));
  show();
  await screen.findByText('Forbidden');
  expect(screen.queryByText('Online source IPs')).toBeNull();
  expect(screen.queryByText('Alice phone')).toBeNull();
});

it('requests devices only when the administrator opens the device panel', async () => {
  const get = vi
    .spyOn(HttpUtil, 'get')
    .mockImplementation(
      async (url) => new Msg(true, '', String(url).includes('/devices/') ? report : []),
    );
  render(
    <QueryClientProvider client={makeTestQueryClient()}>
      <ClientInfoModal
        open
        admin
        client={{ email: 'alice@example.com', subId: 'sub-one', enable: true }}
        inboundsById={{}}
        isOnline
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(get.mock.calls.some(([url]) => String(url).includes('/devices/'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Devices and connections' }));
  await screen.findByText('Alice phone');
  expect(get.mock.calls.filter(([url]) => String(url).includes('/devices/'))).toHaveLength(1);
});
