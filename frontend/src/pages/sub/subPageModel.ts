const DAY_MS = 86_400_000;

export type SubStatus = 'active' | 'unlimited' | 'expired' | 'depleted' | 'disabled';

export interface SubUsage {
  enabled: boolean;
  usedByte: number;
  totalByte: number;
  expireMs: number;
}

export function resolveSubStatus(sub: SubUsage, now: number): SubStatus {
  if (!sub.enabled) return 'disabled';
  if (sub.expireMs > 0 && now >= sub.expireMs) return 'expired';
  if (sub.totalByte > 0 && sub.usedByte >= sub.totalByte) return 'depleted';
  if (sub.totalByte <= 0 && sub.expireMs === 0) return 'unlimited';
  return 'active';
}

export function daysUntil(expireMs: number, now: number): number | null {
  if (expireMs <= 0) return null;
  return Math.max(0, Math.ceil((expireMs - now) / DAY_MS));
}

export function usagePercent(usedByte: number, totalByte: number): number {
  if (totalByte <= 0) return 0;
  const pct = (usedByte / totalByte) * 100;
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
}

export type AppPlatform = 'windows' | 'macos' | 'android' | 'ios';

export function detectPlatform(userAgent: string): AppPlatform {
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
  return 'windows';
}

export interface SubApp {
  name: string;
  url: string;
  copyUrl?: string;
  isCopyOnly?: boolean;
  toast?: string;
}

export interface SubAppSource {
  subUrl: string;
  subClashUrl?: string;
  sId: string;
  subTitle: string;
}

export function buildSubApps({
  subUrl,
  subClashUrl,
  sId,
  subTitle,
}: SubAppSource): Record<AppPlatform, SubApp[]> {
  const encSub = encodeURIComponent(subUrl);
  const encClash = encodeURIComponent(subClashUrl || subUrl);
  const profileName = encodeURIComponent(subTitle || sId || 'Subscription');

  const v2rayn: SubApp = {
    name: 'v2rayN',
    url: subUrl,
    copyUrl: subUrl,
    isCopyOnly: true,
    toast: '已复制 v2rayN 订阅链接！打开 v2rayN 按 Ctrl+V 即可直接导入。',
  };
  const clash: SubApp = {
    name: 'Clash / Mihomo',
    url: `clash://install-config?url=${encClash}&name=${profileName}`,
    copyUrl: subClashUrl || subUrl,
  };
  const singBox: SubApp = {
    name: 'Sing-box',
    url: `sing-box://import-remote-profile?url=${encSub}#${profileName}`,
    copyUrl: subUrl,
  };
  const flclash: SubApp = {
    name: 'FlClash',
    url: `flclash://install-config?url=${encClash}`,
    copyUrl: subClashUrl || subUrl,
  };
  const v2box: SubApp = {
    name: 'V2Box',
    url: `v2box://install-sub?url=${encSub}&name=${encodeURIComponent(sId)}`,
    copyUrl: subUrl,
  };
  const v2raytun: SubApp = { name: 'V2RayTun', url: `v2raytun://import/${subUrl}`, copyUrl: subUrl };
  const happ: SubApp = { name: 'Happ', url: `happ://add/${subUrl}`, copyUrl: subUrl };
  const incy: SubApp = { name: 'Incy', url: `incy://add/${subUrl}`, copyUrl: subUrl };
  const rocketSource = `${subUrl}${subUrl.includes('?') ? '&' : '?'}flag=shadowrocket`;
  const rocketRemark = encodeURIComponent(subTitle || sId || 'Subscription');

  return {
    windows: [
      v2rayn,
      clash,
      singBox,
      flclash,
    ],
    macos: [
      clash,
      singBox,
      v2box,
      flclash,
    ],
    android: [
      v2box,
      { name: 'V2RayNG', url: `v2rayng://install-config?url=${encSub}`, copyUrl: subUrl },
      singBox,
      clash,
      v2raytun,
      happ,
      incy,
    ],
    ios: [
      {
        name: 'Shadowrocket',
        url: `shadowrocket://add/sub://${btoa(rocketSource)}?remark=${rocketRemark}`,
        copyUrl: rocketSource,
      },
      v2box,
      { name: 'Streisand', url: `streisand://import/${encSub}`, copyUrl: subUrl },
      singBox,
      v2raytun,
      happ,
      incy,
    ],
  };
}
