import { describe, expect, it } from 'vitest';

import { userPathBlocked, visibleNavKeys } from '@/layouts/nav-role';

const keys = [
  '/',
  '/inbounds',
  '/clients',
  '/groups',
  '/nodes',
  '/hosts',
  '/outbound',
  '/routing',
  '/settings',
  '/users',
  '/xray',
  '/api-docs',
  '__logout__',
];

describe('panel role navigation', () => {
  it('hides settings and xray from a regular user', () => {
    const visible = visibleNavKeys('user', keys);
    expect(visible).not.toContain('/settings');
    expect(visible).not.toContain('/users');
    expect(visible).not.toContain('/xray');
    expect(visible).not.toContain('/nodes');
    expect(visible).toContain('/inbounds');
    expect(visible).toContain('/clients');
    expect(visible).toContain('__logout__');
  });

  it('keeps every entry for an admin', () => {
    expect(visibleNavKeys('admin', keys)).toEqual(keys);
  });

  it('sends a regular user away from settings', () => {
    expect(userPathBlocked('user', '/settings')).toBe(true);
    expect(userPathBlocked('user', '/users')).toBe(true);
    expect(userPathBlocked('user', '/inbounds')).toBe(false);
    expect(userPathBlocked('admin', '/settings')).toBe(false);
  });

  it('shows only the pages selected for a custom role', () => {
    const pages = ['/clients'];
    expect(visibleNavKeys('user', keys, pages)).toEqual(['/clients', '__logout__']);
    expect(userPathBlocked('user', '/inbounds', pages)).toBe(true);
    expect(userPathBlocked('user', '/clients', pages)).toBe(false);
  });
});
