import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';

import { ThemeProvider } from '@/hooks/useTheme';
import zhCN from '../../../../internal/web/translation/zh-CN.json';
import NodeMonitorPage from './NodeMonitorPage';
import type { MonitoredNode } from './NodeMonitorPage';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const heartbeat = Math.floor(Date.now() / 1000);

const mockNodes: MonitoredNode[] = [
  {
    id: 11,
    name: 'BWH-LosAngeles',
    country: 'US',
    address: 'us-01.example.net',
    status: 'online',
    xrayState: 'running',
    lastHeartbeat: heartbeat - 12,
    panelLatencyMs: 131,
    cpuPct: 0.2,
    memPct: 15.4,
    uptimeSecs: 5 * 86400,
    netUp: 1020,
    netDown: 472,
    loadAverage: '0.02, 0.03, 0.00',
    memoryUsedBytes: 157.54 * MiB,
    memoryTotalBytes: 1023.65 * MiB,
    diskPct: 15.8,
    diskUsedBytes: 3.09 * GiB,
    diskTotalBytes: 19.57 * GiB,
    costLabel: '$49.99 / 季',
    carrierProbes: [
      { name: '电信', latencyMs: 131, lossPct: 0 },
      { name: '移动', latencyMs: 175, lossPct: 0 },
      { name: '联通', latencyMs: 124, lossPct: 0 },
    ],
    inbounds: [
      {
        id: 101,
        remark: '主线路 · VLESS Reality',
        protocol: 'vless',
        port: 443,
        enabled: true,
        up: 29.81 * GiB,
        down: 39.41 * GiB,
        used: 69.22 * GiB,
        total: 1000 * GiB,
        remaining: 930.78 * GiB,
      },
    ],
  },
  {
    id: 12,
    name: 'GreenCloud-Tokyo',
    country: 'JP',
    address: 'jp-01.example.net',
    status: 'online',
    xrayState: 'running',
    lastHeartbeat: heartbeat - 15,
    panelLatencyMs: 65,
    cpuPct: 0.8,
    memPct: 6.1,
    uptimeSecs: 8 * 3600,
    netUp: 3620,
    netDown: 1070,
    loadAverage: '0.01, 0.05, 0.07',
    memoryUsedBytes: 235.75 * MiB,
    memoryTotalBytes: 3.78 * GiB,
    diskPct: 10.0,
    diskUsedBytes: 3.4 * GiB,
    diskTotalBytes: 33.82 * GiB,
    costLabel: '$6.00 / 月',
    carrierProbes: [
      { name: '电信', latencyMs: 65, lossPct: 0 },
      { name: '移动', latencyMs: 70, lossPct: 0 },
      { name: '联通', latencyMs: 112, lossPct: 0 },
    ],
    inbounds: [
      {
        id: 201,
        remark: '东京入口 · Trojan',
        protocol: 'trojan',
        port: 443,
        enabled: true,
        up: 70.21 * 1024,
        down: 22.31 * 1024,
        used: 92.52 * 1024,
        total: 750 * GiB,
        remaining: 750 * GiB - 92.52 * 1024,
      },
    ],
  },
];

function MockProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => {
    const previousLanguage = i18next.language;
    i18next.addResourceBundle('zh-CN', 'translation', zhCN, true, true);
    void i18next.changeLanguage('zh-CN');
    return () => {
      void i18next.changeLanguage(previousLanguage);
    };
  }, []);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

const meta = {
  title: 'Pages/Node Monitor',
  component: NodeMonitorPage,
  decorators: [
    (Story) => (
      <MockProviders>
        <Story />
      </MockProviders>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NodeMonitorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MockConfiguration: Story = { args: { mockData: mockNodes } };

export const UserView: Story = {
  args: {
    mockData: mockNodes.map((node, index) => ({
      id: node.id,
      name: node.name,
      address: node.address,
      status: index === 0 ? 'online' : 'offline',
      xrayState: node.xrayState,
      lastHeartbeat: node.lastHeartbeat,
      panelLatencyMs: index === 0 ? node.panelLatencyMs : 0,
      cpuPct: node.cpuPct,
      memPct: node.memPct,
      uptimeSecs: node.uptimeSecs,
      netUp: node.netUp,
      netDown: node.netDown,
      inbounds: index === 0 ? node.inbounds : [],
    })),
  },
};
