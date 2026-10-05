import { fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NodeStatus from '@/pages/support/NodeStatus';
import { renderWithProviders } from './test-utils';
import { HttpUtil, Msg } from '@/utils';

afterEach(() => vi.restoreAllMocks());

const mockNodes = [
  { id: 1, name: '🇭🇰 香港 CN2 专线 01', protocol: 'vless', status: '已启用' },
  { id: 2, name: '🇯🇵 日本 东京 BGP 01', protocol: 'vmess', status: '已启用' },
  { id: 3, name: '🇺🇸 美国 洛杉矶 01', protocol: 'trojan', status: '已停用' },
];

it('renders node status summary statistics and cards', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, 'ok', mockNodes));

  renderWithProviders(<NodeStatus />);

  await screen.findByText('🇭🇰 香港 CN2 专线 01');

  expect(screen.getByText('总接入节点')).toBeTruthy();
  expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  expect(screen.getByText('🇯🇵 日本 东京 BGP 01')).toBeTruthy();
  expect(screen.getByText('🇺🇸 美国 洛杉矶 01')).toBeTruthy();
});

it('filters nodes by search term', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, 'ok', mockNodes));

  renderWithProviders(<NodeStatus />);

  await screen.findByText('🇭🇰 香港 CN2 专线 01');

  const searchInput = screen.getByPlaceholderText(/搜索节点名称/);
  fireEvent.change(searchInput, { target: { value: '香港' } });

  expect(screen.getByText('🇭🇰 香港 CN2 专线 01')).toBeTruthy();
  expect(screen.queryByText('🇯🇵 日本 东京 BGP 01')).toBeNull();
});

it('switches between grid and table view', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, 'ok', mockNodes));

  renderWithProviders(<NodeStatus />);

  await screen.findByText('🇭🇰 香港 CN2 专线 01');

  const tableButton = screen.getByText('列表视图');
  fireEvent.click(tableButton);

  expect(screen.getByText('地区 / 节点')).toBeTruthy();
  expect(screen.getAllByText('传输协议').length).toBeGreaterThan(0);
  expect(screen.getAllByText('节点状态').length).toBeGreaterThan(0);
});
