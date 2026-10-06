export type SubscriptionClient = 'shadowrocket' | 'clash-verge' | 'clash-mi' | 'universal' | 'v2rayng' | 'v2rayn';
export function subscriptionAddress(client: SubscriptionClient, rawUrl: string, clashUrl: string | undefined, origin: string) {
  const isClash = client === 'clash-verge' || client === 'clash-mi';
  if (isClash && !clashUrl) throw new Error('Clash subscription unavailable');
  const url = new URL(isClash ? clashUrl! : rawUrl, origin);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid subscription URL');
  if (client === 'shadowrocket') url.searchParams.set('flag', 'shadowrocket');
  return url.toString();
}
export function subscriptionImportLink(client: SubscriptionClient, address: string) {
  if (client === 'shadowrocket') {
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(address)));
    return `shadowrocket://add/sub://${encoded}?remark=${encodeURIComponent('我的订阅')}`;
  }
  if (client === 'v2rayng') return `v2rayng://install-config?url=${encodeURIComponent(address)}&name=${encodeURIComponent('我的订阅')}`;
  if (client === 'clash-verge') return `clash://install-config?url=${encodeURIComponent(address)}`;
  if (client === 'clash-mi') return `clashmi://install-config?url=${encodeURIComponent(address)}`;
  return null;
}
