import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented } from 'antd';
import { AndroidOutlined, AppleOutlined, CopyOutlined, DesktopOutlined } from '@ant-design/icons';

import { APP_ICONS } from './appIcons';
import type { AppPlatform, SubApp } from './subPageModel';

interface SubAppsTabProps {
  apps: Record<AppPlatform, SubApp[]>;
  initialPlatform: AppPlatform;
  onOpen: (url: string) => void;
  onCopy: (url: string) => void;
  subUrl: string;
  subClashUrl: string;
}

const PLATFORM_OPTIONS = [
  { value: 'windows' as const, label: 'Windows', icon: <DesktopOutlined /> },
  { value: 'macos' as const, label: 'macOS', icon: <AppleOutlined /> },
  { value: 'android' as const, label: 'Android', icon: <AndroidOutlined /> },
  { value: 'ios' as const, label: 'iOS', icon: <AppleOutlined /> },
];

function AppIcon({ name }: { name: string }) {
  const icon = APP_ICONS[name];
  if (!icon) {
    return (
      <span className="sub-app-mark" aria-hidden="true">
        {name.charAt(0)}
      </span>
    );
  }
  if (icon.tinted) {
    const mask = `url("${icon.src}")`;
    return (
      <span className="sub-app-mark" aria-hidden="true">
        <span className="sub-app-glyph" style={{ maskImage: mask, WebkitMaskImage: mask }} />
      </span>
    );
  }
  return <img className="sub-app-logo" src={icon.src} alt="" width={32} height={32} />;
}

export default function SubAppsTab({ apps, initialPlatform, onOpen, onCopy, subUrl, subClashUrl }: SubAppsTabProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<AppPlatform>(initialPlatform);

  return (
    <div className="sub-apps">
      <Segmented<AppPlatform> value={platform} onChange={setPlatform} options={PLATFORM_OPTIONS} />
      {(platform === 'windows' || platform === 'macos') && (
        <div className="sub-app-grid">
          <p className="sub-muted">{t('subscription.desktopImportHint')}</p>
          {[
            { name: platform === 'windows' ? 'v2rayN' : 'sing-box', url: subUrl },
            { name: 'Clash / Mihomo', url: subClashUrl },
          ].filter((item) => item.url).map((item) => (
            <div key={item.name} className="sub-row">
              <span className="sub-app-mark" aria-hidden="true">{item.name.charAt(0)}</span>
              <span className="sub-app-name">{item.name}</span>
              <Button icon={<CopyOutlined />} onClick={() => onCopy(item.url)}>{t('copy')}</Button>
            </div>
          ))}
        </div>
      )}
      <div className="sub-app-grid">
        {apps[platform].map((app) => (
          <div key={app.name} className="sub-row">
            <AppIcon name={app.name} />
            <span className="sub-app-name">{app.name}</span>
            <Button type="primary" size="small" onClick={() => onOpen(app.url)}>
              {t('add')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
