import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SubscriptionAuthorizations from '@/pages/subscriptions/SubscriptionAuthorizations';
import { HttpUtil, Msg } from '@/utils';
import { renderWithProviders } from './test-utils';

afterEach(() => vi.restoreAllMocks());
it('issues an authorization and preserves its token across client formats', async () => {
  const token = 'ab'.repeat(32);
  const devices: Array<{
    id: number;
    authorization: boolean;
    deviceModel: string;
    deviceOs: string;
    osVersion: string;
    fingerprint: string;
    userAgent: string;
    lastIp: string;
    firstSeen: number;
    lastSeen: number;
  }> = [];
  vi.spyOn(HttpUtil, 'get').mockImplementation(
    async () =>
      new Msg(true, '', {
        registered: devices.length,
        limit: 3,
        remaining: 3 - devices.length,
        full: false,
        devices,
      }),
  );
  const post = vi.spyOn(HttpUtil, 'post').mockImplementation(async () => {
    devices.push({
      id: 1,
      authorization: true,
      deviceModel: 'Windows',
      deviceOs: '',
      osVersion: '',
      fingerprint: 'hash',
      userAgent: '',
      lastIp: '',
      firstSeen: 1,
      lastSeen: 0,
    });
    return new Msg(true, '', { id: 1, token, name: 'Windows' });
  });
  renderWithProviders(
    <SubscriptionAuthorizations
      userId={7}
      url="https://example.com/sub/demo"
      clashUrl="https://example.com/clash/demo"
    />,
  );
  fireEvent.change(await screen.findByRole('textbox', { name: '授权名称' }), {
    target: { value: 'Windows' },
  });
  fireEvent.click(screen.getByRole('button', { name: '创建授权' }));
  await screen.findByRole('button', { name: 'Clash Verge Rev' });
  expect(post).toHaveBeenCalledWith(
    '/panel/api/clients/myDevices',
    { name: 'Windows', replaceId: 0 },
    { silent: true, headers: { 'Content-Type': 'application/json' } },
  );
  const address = () =>
    new URL((screen.getByRole('textbox', { name: '订阅地址' }) as HTMLInputElement).value);
  expect(address().pathname).toBe('/clash/demo');
  expect(address().searchParams.get('device_token')).toBe(token);
  expect(address().searchParams.get('view')).toBe('raw');
  fireEvent.click(screen.getByRole('button', { name: 'iOS' }));
  await waitFor(() => expect(address().pathname).toBe('/sub/demo'));
  expect(address().searchParams.get('device_token')).toBe(token);
  expect(address().searchParams.get('flag')).toBe('shadowrocket');
});
