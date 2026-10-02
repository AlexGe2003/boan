import { fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ServerUsage from '@/pages/nodes/ServerUsage';
import { renderWithProviders } from './test-utils';
import { HttpUtil, Msg, SizeFormatter } from '@/utils';

afterEach(() => vi.restoreAllMocks());

const report = {
  servers: [
    {
      nodeId: 1,
      recorded: 300,
      adjustment: 0,
      unattributed: 0,
      quota: 0,
      quotaBasis: 'proxy',
      quotaUsed: 300,
      remaining: 0,
      exceeded: false,
      billingMultiplier: 2,
      billable: 600,
      billingShare: 100,
      name: '香港节点',
      local: false,
      up: 100,
      down: 200,
      used: 300,
      share: 100,
      users: 1,
      startedAt: 1,
      updatedAt: 2,
    },
  ],
  users: [
    {
      email: 'alice@example.com',
      username: 'Alice',
      recorded: 300,
      adjustment: 0,
      quota: 0,
      quotaBasis: 'proxy',
      quotaUsed: 300,
      remaining: 0,
      exceeded: false,
      billable: 600,
      up: 100,
      down: 200,
      used: 300,
      share: 75,
      startedAt: 1,
      updatedAt: 2,
    },
  ],
  total: 300,
  billableTotal: 600,
  userCount: 1,
  truncated: false,
  generatedAt: 2,
};
it('switches from exact user distribution to a server ranking and back', async () => {
  const get = vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, '', report));
  renderWithProviders(<ServerUsage email="alice@example.com" />);
  fireEvent.click(await screen.findByRole('button', { name: '查看用户排行' }));
  await screen.findByRole('button', { name: /返回用户分布/ });
  await screen.findAllByText('Alice');
  expect(get).toHaveBeenCalledWith('/panel/api/nodes/usage?email=alice%40example.com');
  expect(get).toHaveBeenCalledWith('/panel/api/nodes/usage?nodeId=1');
  fireEvent.click(screen.getByRole('button', { name: /返回用户分布/ }));
  await screen.findByRole('button', { name: '查看用户排行' });
});

it('does not show a zero total or ranking when collection cannot be loaded', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(false, 'Forbidden', null));
  renderWithProviders(<ServerUsage nodeId={0} />);
  await screen.findByText('流量统计加载失败');
  expect(screen.queryByText('有流量记录的用户')).toBeNull();
  expect(screen.queryByText('流量最多的用户')).toBeNull();
});

it('persists the relay billing mode and refreshes totals without altering recorded usage', async () => {
  let current = structuredClone(report);
  vi.spyOn(HttpUtil, 'get').mockImplementation(async () => new Msg(true, '', current));
  const post = vi.spyOn(HttpUtil, 'post').mockImplementation(async () => {
    current = {
      ...current,
      billableTotal: 300,
      servers: current.servers.map((row) => ({ ...row, billingMultiplier: 1, billable: 300 })),
      users: current.users.map((row) => ({ ...row, billable: 300 })),
    };
    return new Msg(true, '', null);
  });
  renderWithProviders(<ServerUsage nodeId={1} />);
  const select = await screen.findByRole('combobox', { name: '服务器计费口径' });
  fireEvent.mouseDown(select);
  fireEvent.click(await screen.findByText('已记录代理用量 × 1'));
  await vi.waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/panel/api/nodes/usage/billing',
      { nodeId: 1, multiplier: 1 },
      { headers: { 'Content-Type': 'application/json' }, silent: true },
    ),
  );
  await vi.waitFor(() =>
    expect(select.closest('.ant-select')?.textContent).toContain('已记录代理用量 × 1'),
  );
  expect(current.total).toBe(300);
});

it('sums selected relay and landing servers with their individual multipliers', async () => {
  const combined = {
    ...report,
    servers: [
      report.servers[0],
      { ...report.servers[0], nodeId: 2, name: '美国落地', billingMultiplier: 1, billable: 300 },
      { ...report.servers[0], nodeId: 3, name: '其他服务器', used: 50, billable: 100 },
    ],
    total: 650,
    billableTotal: 1000,
  };
  const get = vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, '', combined));
  const view = renderWithProviders(<ServerUsage />);
  const select = await screen.findByRole('combobox', { name: '汇总服务器' });
  fireEvent.mouseDown(select);
  fireEvent.click(screen.getByText('香港节点', { selector: '.ant-select-item-option-content' }));
  fireEvent.click(screen.getByText('美国落地', { selector: '.ant-select-item-option-content' }));
  const summary = view.container.querySelector('.server-usage-summary');
  expect(summary?.textContent).toContain(SizeFormatter.sizeFormat(600));
  expect(summary?.textContent).toContain(SizeFormatter.sizeFormat(900));
  expect(summary?.textContent).not.toContain(SizeFormatter.sizeFormat(1800));
  expect(view.container.querySelector('.ant-table-tbody')?.textContent).not.toContain('其他服务器');
  expect(get).toHaveBeenCalledWith('/panel/api/nodes/usage');
});

it('saves a user quota and absolute correction for the selected node only', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, '', report));
  const post = vi.spyOn(HttpUtil, 'post').mockResolvedValue(new Msg(true, '', null));
  renderWithProviders(<ServerUsage email="alice@example.com" />);
  fireEvent.click(await screen.findByRole('button', { name: '设置用户节点用量' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: '此用户在该节点的额度（GB）' }), {
    target: { value: '20' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: '同时校正已用量' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: '校正后的统计已用量（GB）' }), {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await vi.waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/panel/api/nodes/usage/control',
      {
        nodeId: 1,
        email: 'alice@example.com',
        quota: 20 * 1073741824,
        basis: 'proxy',
        adjustUsage: true,
        used: 10 * 1073741824,
      },
      { headers: { 'Content-Type': 'application/json' }, silent: true },
    ),
  );
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('keeps the usage editor open when the server rejects a node correction', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, '', report));
  vi.spyOn(HttpUtil, 'post').mockResolvedValue(
    new Msg(false, '节点已用量不能低于已归属用户的统计用量', null),
  );
  renderWithProviders(<ServerUsage nodeId={1} />);
  fireEvent.click(await screen.findByRole('button', { name: '设置节点额度 / 用量' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '同时校正已用量' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: '校正后的统计已用量（GB）' }), {
    target: { value: '0' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await screen.findByText(/Error: 节点已用量不能低于已归属用户的统计用量/);
  expect(screen.getByRole('dialog')).not.toBeNull();
});
