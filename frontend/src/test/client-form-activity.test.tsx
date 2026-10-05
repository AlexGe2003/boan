import { fireEvent, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import ClientFormModal from '@/pages/clients/ClientFormModal';
import { makeTestQueryClient, renderWithProviders } from './test-utils';

vi.mock('@/pages/clients/ClientActivity', () => ({
  default: ({ email }: { email: string }) => <div>Activity for {email}</div>,
}));

function show(admin: boolean) {
  return renderWithProviders(<QueryClientProvider client={makeTestQueryClient()}>
    <ClientFormModal admin={admin} open mode="edit" client={{ email: 'alice', enable: true }}
      inbounds={[]} save={vi.fn()} onOpenChange={vi.fn()} />
  </QueryClientProvider>);
}

it('loads the saved user activity only when the administrator selects its tab', async () => {
  show(true);
  expect(screen.queryByText('Activity for alice')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '访问记录' }));
  await screen.findByText('Activity for alice');
  expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Basics' }));
  expect(screen.queryByText('Activity for alice')).toBeNull();
  expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
});

it('does not expose the activity tab to a non-administrator', () => {
  show(false);
  expect(screen.queryByRole('tab', { name: '访问记录' })).toBeNull();
});
