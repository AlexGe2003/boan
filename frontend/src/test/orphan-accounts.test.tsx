import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import PanelUsers from '@/pages/settings/PanelUsers';
import { HttpUtil } from '@/utils';
import { renderWithProviders } from './test-utils';

vi.mock('@/api/queries/usePanelRole', () => ({
  usePanelAccess: () => ({ userId: 1, role: 'admin', roleKey: 'admin', pages: [] }),
}));

afterEach(() => vi.restoreAllMocks());

it('shows a missing subscription login and requires confirmation before removing only that account', async () => {
  const users = [
    { id: 1, username: 'admin', role: 'admin', inboundCount: 0 },
    { id: 9, username: 'user1', role: 'customer', inboundCount: 0, subscriptionStatus: 'missing' },
    {
      id: 10,
      username: 'real-customer',
      role: 'customer',
      inboundCount: 0,
      subscriptionStatus: 'linked',
    },
    {
      id: 11,
      username: 'unbound',
      role: 'customer',
      inboundCount: 0,
      subscriptionStatus: 'unbound',
    },
  ];
  vi.spyOn(HttpUtil, 'get').mockResolvedValue({ success: true, msg: '', obj: users });
  const post = vi.spyOn(HttpUtil, 'post').mockResolvedValue({ success: true, msg: '', obj: null });
  renderWithProviders(
    <MemoryRouter initialEntries={['/settings?orphanAccount=user1#administrators']}>
      <PanelUsers />
    </MemoryRouter>,
  );
  const section = await screen.findByRole('region', { name: '失效订阅账号' });
  expect(within(section).getByText('关联订阅已删除')).toBeDefined();
  expect(within(section).getByText('未绑定订阅')).toBeDefined();
  expect(within(section).getByText('当前查找')).toBeDefined();
  expect(screen.queryByText('real-customer')).toBeNull();
  const row = within(section).getByText('user1').closest('tr');
  if (!row) throw new Error('Missing orphan account row');
  fireEvent.click(within(row).getByRole('button', { name: '删除失效账号' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('删除失效登录账号：user1')).toBeDefined();
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认删除失效账号' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/panel/api/setting/users/delete/9',
      { reassignTo: 0, onlyOrphan: true },
      expect.anything(),
    ),
  );
});
