import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NodeGroupBuyModal from '@/pages/nodes/NodeGroupBuyModal';
import { NodeGroupBuyFormSchema } from '@/schemas/node-group-buy';
import { HttpUtil, Msg } from '@/utils';
import { groupBuyQuote, sortGroupBuyNodes } from '@/pages/nodes/groupBuyPricing';
import { renderWithProviders } from './test-utils';

afterEach(() => vi.restoreAllMocks());
const item = {
  nodeId: 2,
  name: '美国落地',
  configured: true,
  monthlyFee: 1000,
  monthlyTotal: 11000,
  perMember: 1100,
  expiryStatus: 'active',
  config: {
    nodeId: 2,
    groupName: '拼团',
    provider: '',
    region: '',
    monthlyPrice: 10000,
    expiresAt: 0,
    bandwidthMbps: 1000,
    bandwidthMode: 'shared',
    monthlyTraffic: 1073741824,
    memberCount: 10,
    feeMode: 'percent',
    feeValue: 1000,
    notes: '',
    updatedAt: 0,
  },
};
it('saves yuan as cents and percentages as basis points for the selected node', async () => {
  const post = vi.spyOn(HttpUtil, 'post').mockResolvedValue(new Msg(true, '', null));
  const close = vi.fn();
  renderWithProviders(<NodeGroupBuyModal item={item} onClose={close} />);
  fireEvent.change(screen.getByLabelText('节点月租（元 / 月）'), { target: { value: '123.45' } });
  fireEvent.change(screen.getByLabelText('月租手续费比例（%）'), { target: { value: '12.5' } });
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith(
    '/panel/api/nodes/group-buy',
    expect.objectContaining({
      nodeId: 2,
      monthlyPrice: 12345,
      feeValue: 1250,
      feeMode: 'percent',
      monthlyTraffic: 1073741824,
      memberCount: 10,
    }),
    expect.anything(),
  );
});
it('keeps the form open when saving fails', async () => {
  vi.spyOn(HttpUtil, 'post').mockResolvedValue(new Msg(false, '保存被拒绝', null));
  const close = vi.fn();
  renderWithProviders(<NodeGroupBuyModal item={item} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
  await screen.findByText('保存失败');
  expect(close).not.toHaveBeenCalled();
  expect((screen.getByLabelText('节点月租（元 / 月）') as HTMLInputElement).value).toBe('100.00');
});
it('rejects a percentage above 100 before making a request', () => {
  const values = {
    groupName: '',
    provider: '',
    region: '',
    monthlyPrice: 100,
    expiresAt: 0,
    bandwidthMbps: 1000,
    bandwidthMode: 'shared',
    trafficGB: 1,
    memberCount: 10,
    feeMode: 'percent',
    feeValue: 101,
    notes: '',
  };
  expect(NodeGroupBuyFormSchema.safeParse(values).success).toBe(false);
  expect(NodeGroupBuyFormSchema.safeParse({ ...values, feeValue: 10 }).success).toBe(true);
});

it('updates the quote while editing and handles an unset member count', () => {
  renderWithProviders(<NodeGroupBuyModal item={item} onClose={vi.fn()} />);
  const preview = within(screen.getByRole('region', { name: '实时月费预览' }));
  expect(preview.getByText('¥11.00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('计划拼团人数'), { target: { value: '5' } });
  expect(preview.getByText('¥22.00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('月租手续费比例（%）'), { target: { value: '20' } });
  expect(preview.getByText('¥24.00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('计划拼团人数'), { target: { value: '0' } });
  expect(preview.getByText('待设置人数')).toBeTruthy();
});
it('matches persisted rounding of fees and per-member prices', () => {
  expect(groupBuyQuote(100.01, 'percent', 10, 3)).toEqual({
    cost: 10001,
    fee: 1001,
    total: 11002,
    perMember: 3668,
  });
  expect(groupBuyQuote(100.01, 'fixed', 10, 3)).toEqual({
    cost: 10001,
    fee: 1000,
    total: 11001,
    perMember: 3667,
  });
  expect(groupBuyQuote(100, 'percent', 101, 10)).toBeNull();
});
it('prioritizes due nodes and keeps unconfigured nodes after configured ones without mutating input', () => {
  const rows = [
    item,
    {
      ...item,
      nodeId: 3,
      expiryStatus: 'soon',
      monthlyFee: 3000,
      config: { ...item.config, monthlyPrice: 20000 },
    },
    { ...item, nodeId: 0, configured: false, expiryStatus: 'unset' },
    { ...item, nodeId: 4, expiryStatus: 'expired' },
  ];
  expect(sortGroupBuyNodes(rows, 'expiry').map((row) => row.nodeId)).toEqual([4, 3, 2, 0]);
  expect(sortGroupBuyNodes(rows, 'cost').map((row) => row.nodeId)).toEqual([3, 2, 4, 0]);
  expect(sortGroupBuyNodes(rows, 'fee').map((row) => row.nodeId)).toEqual([3, 2, 4, 0]);
  expect(rows.map((row) => row.nodeId)).toEqual([2, 3, 0, 4]);
});
