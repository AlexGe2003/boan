import { describe, expect, it } from 'vitest';
import {
  subscriptionAddress,
  subscriptionImportLink,
} from '@/pages/subscriptions/subscription-links';
const raw = 'https://example.com/sub/test-token?x=1&y=2';
const clash = 'https://example.com/clash/test-token?x=1&y=2';
describe('subscription client links', () => {
  it('preserves the full Clash subscription in a single encoded parameter', () => {
    for (const client of ['clash-verge', 'clash-mi'] as const) {
      const address = subscriptionAddress(client, raw, clash, 'https://example.com');
      const link = new URL(subscriptionImportLink(client, address)!);
      expect(link.protocol).toBe(client === 'clash-mi' ? 'clashmi:' : 'clash:');
      expect(link.searchParams.get('url')).toBe(clash);
      expect(link.searchParams.has('y')).toBe(false);
    }
  });
  it('uses the Shadowrocket sub scheme and encodes the flagged subscription', () => {
    const address = subscriptionAddress('shadowrocket', raw, clash, 'https://example.com');
    const link = subscriptionImportLink('shadowrocket', address)!;
    expect(link.startsWith('shadowrocket://add/sub://')).toBe(true);
    const encoded = link.split('sub://')[1].split('?')[0];
    expect(atob(encoded)).toBe(address);
    expect(new URLSearchParams(link.split('?')[1]).get('remark')).toBe('status.huckge.com');
    expect(new URL(address).searchParams.get('flag')).toBe('shadowrocket');
    expect(new URL(address).searchParams.get('y')).toBe('2');
  });
  it('does not send a raw subscription to a Clash client when Clash is unavailable', () => {
    expect(() => subscriptionAddress('clash-mi', raw, undefined, 'https://example.com')).toThrow();
    expect(subscriptionImportLink('universal', raw)).toBeNull();
  });
  it('imports the raw subscription into v2rayNG without losing query parameters', () => {
    const address = subscriptionAddress('v2rayng', raw, clash, 'https://example.com');
    const link = new URL(subscriptionImportLink('v2rayng', address)!);
    expect(address).toBe(raw);
    expect(link.protocol).toBe('v2rayng:');
    expect(link.searchParams.get('url')).toBe(raw);
    expect(link.searchParams.get('name')).toBe('status.huckge.com');
  });
  it('copies the raw subscription for v2rayN without inventing an import scheme', () => {
    expect(subscriptionAddress('v2rayn', raw, clash, 'https://example.com')).toBe(raw);
    expect(subscriptionImportLink('v2rayn', raw)).toBeNull();
  });
  it('rejects executable URLs', () => {
    expect(() =>
      subscriptionAddress('universal', 'javascript:alert(1)', undefined, 'https://example.com'),
    ).toThrow();
  });
});

it('enables client device identification only for restricted Clash Mi imports', () => {
  const address = 'https://example.com/clash/private?view=raw';
  const restricted = new URL(subscriptionImportLink('clash-mi', address, true)!);
  expect(restricted.searchParams.get('xhwid')).toBe('true');
  expect(restricted.searchParams.get('url')).toBe(address);
  expect(new URL(subscriptionImportLink('clash-mi', address)!).searchParams.has('xhwid')).toBe(
    false,
  );
});

it('imports Karing using the raw subscription and enables device identification when required', () => {
  const address = subscriptionAddress('karing', raw, clash, 'https://example.com');
  expect(address).toBe(raw);
  const link = new URL(subscriptionImportLink('karing', address, true)!);
  expect(link.protocol).toBe('karing:');
  expect(link.searchParams.get('url')).toBe(raw);
  expect(link.searchParams.get('xhwid')).toBe('true');
  expect(new URL(subscriptionImportLink('karing', address)!).searchParams.has('xhwid')).toBe(false);
});
