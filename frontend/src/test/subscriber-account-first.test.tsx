import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriberModal from '@/pages/plans/SubscriberModal';
import { postPlan } from '@/pages/plans/api';
import { chooseSelectOption, renderWithProviders } from './test-utils';

vi.mock('@/pages/plans/api', () => ({
  useSubscriptionPlans: () => ({
    data: [{ id: 7, name: 'Standard', enabled: true }],
    isSuccess: true,
  }),
  postPlan: vi.fn(),
  planSummary: () => 'plan summary',
}));

describe('create login before configuring nodes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a new login name instead of submitting the existing default user', async () => {
    renderWithProviders(<SubscriberModal onSaved={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('登录账号') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: '创建用户' }));
    await screen.findByText('请输入登录账号');
    expect(postPlan).not.toHaveBeenCalled();
  });

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

  it('offers the original subscription without creating or modifying its account', async () => {
    vi.mocked(postPlan).mockResolvedValue({
      success: false,
      msg: '该订阅标识已存在，尚未开通登录账号',
      obj: { conflict: 'subscription_exists', email: 'legacy-user', accountExists: false },
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const onOpenExisting = vi.fn();
    const onManageAccount = vi.fn();
    renderWithProviders(
      <SubscriberModal
        onSaved={onSaved}
        onClose={onClose}
        onOpenExisting={onOpenExisting}
        onManageAccount={onManageAccount}
      />,
    );
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'legacy-user' } });
    fireEvent.click(screen.getByRole('button', { name: '创建用户' }));
    const manage = await screen.findByRole('button', { name: '在原订阅上开通账号' });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onManageAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '查看原用户并分配套餐' }));
    expect(onOpenExisting).toHaveBeenCalledWith('legacy-user');
    fireEvent.click(manage);
    expect(onManageAccount).toHaveBeenCalledWith('legacy-user');
    expect(postPlan).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('登录账号'), { target: { value: 'another-user' } });
    expect(screen.queryByRole('button', { name: '在原订阅上开通账号' })).toBeNull();
  });

  it('refreshes existing users when applying a plan only partially succeeds', async () => {
    vi.mocked(postPlan).mockResolvedValue({ success: false, msg: '部分节点同步失败', obj: null });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <SubscriberModal emails={['customer-a', 'customer-b']} onSaved={onSaved} onClose={onClose} />,
    );
    chooseSelectOption(screen.getByRole('combobox').id, 'Standard — plan summary');
    fireEvent.click(screen.getByRole('button', { name: '分配套餐' }));
    await screen.findByText('部分节点同步失败');
    expect(postPlan).toHaveBeenCalledExactlyOnceWith('apply', {
      planId: 7,
      emails: ['customer-a', 'customer-b'],
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
