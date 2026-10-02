import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ClusterControl from '@/pages/nodes/ClusterControl';
import { renderWithProviders } from './test-utils';
import { HttpUtil, Msg } from '@/utils';

afterEach(() => vi.restoreAllMocks());

it('requires a reachable URL before enabling unified login', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(true, '', { phase: 'standalone' }));
  const post = vi.spyOn(HttpUtil, 'post').mockResolvedValue(new Msg(true, '', null));
  renderWithProviders(<ClusterControl />);
  fireEvent.click(await screen.findByRole('button', { name: '启用统一登录' }));
  const submit = await screen.findByRole('button', { name: '检查并启用' });
  expect(submit.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('本站可从其他节点访问的 HTTPS 地址'), {
    target: { value: 'https://panel.example.com/private/' },
  });
  fireEvent.click(submit);
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/panel/api/cluster/initialize', {
      url: 'https://panel.example.com/private/',
      allowPrivate: false,
    }),
  );
});

it('offers recovery but no cancellation after committing starts', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(
    new Msg(true, '', {
      phase: 'committing',
      pending: true,
      self: 'a',
      primary: 'a',
      epoch: 2,
      peers: [{ guid: 'a', name: 'A', address: 'a.example.com' }],
    }),
  );
  renderWithProviders(<ClusterControl />);
  expect(await screen.findByRole('button', { name: '恢复交接' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: '取消本次交接' })).toBeNull();
  expect(screen.queryByRole('button', { name: '切换主站' })).toBeNull();
});

it('does not imply a healthy cluster when status cannot be read', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue(new Msg(false, '连接失败', null));
  renderWithProviders(<ClusterControl />);
  expect(await screen.findByText('无法读取集群状态')).not.toBeNull();
  expect(screen.queryByRole('button', { name: '启用统一登录' })).toBeNull();
});
