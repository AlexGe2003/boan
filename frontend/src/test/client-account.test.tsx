import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ClientAccountModal from '@/pages/clients/ClientAccountModal';
import { HttpUtil } from '@/utils';
import { renderWithProviders } from './test-utils';

afterEach(() => vi.restoreAllMocks());

it('opens a login on the original subscription with its own identifier', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue({ success: true, msg: '', obj: { username: '' } });
  const post = vi.spyOn(HttpUtil, 'post').mockResolvedValue({ success: true, msg: '', obj: null });
  const onSaved = vi.fn();
  renderWithProviders(
    <ClientAccountModal email="legacy-customer" onClose={vi.fn()} onSaved={onSaved} />,
  );
  await waitFor(() =>
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('legacy-customer'),
  );
  fireEvent.click(screen.getByRole('button', { name: '创建账号' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/panel/api/clients/account/legacy-customer',
      { username: 'legacy-customer', password: 'user' },
      expect.anything(),
    ),
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
});

it('keeps the original login name and leaves an existing password untouched', async () => {
  vi.spyOn(HttpUtil, 'get').mockResolvedValue({
    success: true,
    msg: '',
    obj: { username: 'Alpha' },
  });
  const post = vi.spyOn(HttpUtil, 'post').mockResolvedValue({ success: true, msg: '', obj: null });
  renderWithProviders(<ClientAccountModal email="Q0103690" onClose={vi.fn()} />);
  await waitFor(() =>
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('Alpha'),
  );
  expect((screen.getByLabelText('新密码（留空保留原密码）') as HTMLInputElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: '保存更改' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/panel/api/clients/account/Q0103690',
      { username: 'Alpha', password: '' },
      expect.anything(),
    ),
  );
});
