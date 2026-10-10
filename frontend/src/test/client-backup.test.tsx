import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ClientImportModal from '@/pages/clients/ClientImportModal';
import { parseClientBackup } from '@/pages/clients/clientBackup';
import { renderWithProviders } from './test-utils';

const backup = JSON.stringify([
  {
    client: {
      email: 'demo-backup',
      id: 'uuid-original',
      subId: 'sub-original',
      enable: false,
      totalGB: 100,
      limitHwid: 2,
    },
    inboundIds: null,
  },
]);
it('accepts legacy exports and keeps credentials and settings intact', () => {
  const parsed = parseClientBackup('\uFEFF' + backup);
  expect(parsed[0].client).toMatchObject({
    id: 'uuid-original',
    subId: 'sub-original',
    enable: false,
    totalGB: 100,
    limitHwid: 2,
  });
  expect(parsed[0].inboundIds).toEqual([]);
  expect(() => parseClientBackup('[{"client":{"email":"demo"},"inboundIds":[-1]}]')).toThrow();
  expect(() => parseClientBackup('{"success":true}')).toThrow();
});
it('previews import and lists every skipped reason without overwriting data', async () => {
  const restore = vi.fn().mockResolvedValue({
    created: 0,
    skipped: [{ email: 'demo-backup', reason: 'email already in use' }],
  });
  renderWithProviders(<ClientImportModal onClose={vi.fn()} onImport={restore} />);
  fireEvent.change(screen.getByLabelText('用户备份 JSON'), { target: { value: backup } });
  await screen.findByText(/待导入 1 条/);
  fireEvent.click(screen.getByRole('button', { name: /开始导入/ }));
  await screen.findByText('已新增 0 位用户，跳过 1 条');
  await screen.findByText('email already in use');
  expect(JSON.parse(restore.mock.calls[0][0])[0].client.id).toBe('uuid-original');
  expect(screen.getByRole('button', { name: /导入已完成/ }).hasAttribute('disabled')).toBe(true);
});
it('rejects malformed files before submission and keeps failed imports editable', async () => {
  const restore = vi.fn().mockRejectedValue(new Error('服务不可用'));
  renderWithProviders(<ClientImportModal onClose={vi.fn()} onImport={restore} />);
  const input = screen.getByLabelText('用户备份 JSON');
  fireEvent.change(input, { target: { value: 'not json' } });
  expect(screen.getByRole('button', { name: /开始导入/ }).hasAttribute('disabled')).toBe(true);
  expect(restore).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: backup } });
  fireEvent.click(screen.getByRole('button', { name: /开始导入/ }));
  await screen.findByText('服务不可用');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /开始导入/ }).hasAttribute('disabled')).toBe(false),
  );
  expect((input as HTMLTextAreaElement).value).toBe(backup);
});
