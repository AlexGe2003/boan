export type PanelRole = 'admin' | 'user' | 'loading' | 'error';

const userPaths = new Set([
  '/',
  '/inbounds',
  '/clients',
  '/hosts',
  '/my-subscriptions',
  '/node-monitor',
]);

export function visibleNavKeys(
  role: PanelRole,
  keys: string[],
  pages: string[] = [...userPaths],
): string[] {
  if (role === 'loading' || role === 'error') return [];
  if (role !== 'user') return keys;
  return keys.filter((key) => pages.includes(key) || key === '__logout__');
}

export function userPathBlocked(
  role: PanelRole,
  pathname: string,
  pages: string[] = [...userPaths],
): boolean {
  if (role !== 'user') return false;
  const segment = pathname.split('/').filter(Boolean)[0];
  const page = segment ? `/${segment}` : '/';
  return !pages.includes(page);
}
