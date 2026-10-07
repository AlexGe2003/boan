import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SubscriberModal from '@/pages/plans/SubscriberModal';
import { postPlan } from '@/pages/plans/api';
import { renderWithProviders } from './test-utils';

vi.mock('@/pages/plans/api', () => ({
  useSubscriptionPlans: () => ({ data: [], isSuccess: true }),
  postPlan: vi.fn(),
  planSummary: () => '',
}));

describe('create login before configuring nodes', () => {
  it('submits account-only creation without a node or plan selection', async () => {
    vi.mocked(postPlan).mockResolvedValue({ success: true, msg: '', obj: null });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<SubscriberModal onSaved={onSaved} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'new-customer' } });
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'new-password' } });
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '创建用户' }));
    await waitFor(() =>
      expect(postPlan).toHaveBeenCalledExactlyOnceWith('subscribe', {
        username: 'new-customer',
        password: 'new-password',
        accountOnly: true,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
