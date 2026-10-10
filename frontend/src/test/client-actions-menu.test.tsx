import type { ReactElement } from 'react';
import { ConfigProvider } from 'antd';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ClientActionsMenu from '@/pages/clients/ClientActionsMenu';
import { ClientRowActions } from '@/pages/clients/RowCells';
import ResetSubscriptionButton from '@/pages/subscriptions/ResetSubscriptionButton';
import { HttpUtil, Msg } from '@/utils';
import { renderWithProviders } from './test-utils';

function show(ui: ReactElement) {
  return renderWithProviders(
    <ConfigProvider theme={{ token: { motion: false } }}>{ui}</ConfigProvider>,
  );
}

beforeEach(() => {
  vi.mocked(HttpUtil.post).mockClear();
  vi.mocked(HttpUtil.post).mockResolvedValue(new Msg(true, '', {}));
});

it('keeps account management in the row menu and opens the selected client', async () => {
  const onAccount = vi.fn();
  const noop = vi.fn();
  show(
    <ClientRowActions
      email="alice@example.com"
      onShowQr={noop}
      onShowInfo={noop}
      onResetTraffic={noop}
      onEdit={noop}
      onDelete={noop}
      onAccount={onAccount}
      onSubscriptionReset={noop}
    />,
  );
  expect(screen.queryByRole('button', { name: '重置订阅链接' })).toBeNull();
  expect(screen.queryByText('管理登录账号')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'more' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /管理登录账号/ }));
  expect(onAccount).toHaveBeenCalledExactlyOnceWith('alice@example.com');
  expect(HttpUtil.post).not.toHaveBeenCalled();
});

it('requires confirmation before resetting, allows cancellation and resets the correct client', async () => {
  const onReset = vi.fn();
  show(<ClientActionsMenu email="alice+phone@example.com" onSubscriptionReset={onReset} />);
  const openReset = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'more' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /重置订阅链接/ }));
    return screen.findByRole('dialog');
  };
  const first = await openReset();
  expect(first.textContent).toContain('alice+phone@example.com');
  expect(first.textContent).toContain('旧订阅链接将失效');
  expect(HttpUtil.post).not.toHaveBeenCalled();
  fireEvent.click(within(first).getByRole('button', { name: /取\s*消/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(HttpUtil.post).not.toHaveBeenCalled();
  const second = await openReset();
  fireEvent.click(within(second).getByRole('button', { name: '确认重置' }));
  await waitFor(() =>
    expect(HttpUtil.post).toHaveBeenCalledExactlyOnceWith(
      '/panel/api/clients/resetSubscription/alice%2Bphone%40example.com',
      undefined,
      { silent: true },
    ),
  );
  await waitFor(() => expect(onReset).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('omits account and subscription reset for roles without those actions', async () => {
  const onEdit = vi.fn();
  show(<ClientActionsMenu email="bob@example.com" onEdit={onEdit} />);
  fireEvent.click(screen.getByRole('button', { name: 'more' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /Edit/ }));
  expect(onEdit).toHaveBeenCalledExactlyOnceWith('bob@example.com');
  expect(screen.queryByRole('menuitem', { name: /管理登录账号/ })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: /重置订阅链接/ })).toBeNull();
});

it('preserves the customer reset button and its own subscription endpoint', async () => {
  show(<ResetSubscriptionButton />);
  fireEvent.click(screen.getByRole('button', { name: '重置订阅链接' }));
  const dialog = await screen.findByRole('dialog');
  expect(HttpUtil.post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认重置' }));
  await waitFor(() =>
    expect(HttpUtil.post).toHaveBeenCalledExactlyOnceWith(
      '/panel/api/clients/resetMySubscription',
      undefined,
      { silent: true },
    ),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('requires confirmation before rotating credentials for all devices', async () => {
  show(<ResetSubscriptionButton resetConnections />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset connection credentials' }));
  let dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/All devices must import the new subscription/)).toBeTruthy();
  expect(within(dialog).getByText(/existing long-lived connections may continue/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(HttpUtil.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reset connection credentials' }));
  dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(HttpUtil.post).toHaveBeenCalledExactlyOnceWith(
      '/panel/api/clients/resetMySubscription',
      { resetConnections: true },
      { silent: true },
    ),
  );
});
