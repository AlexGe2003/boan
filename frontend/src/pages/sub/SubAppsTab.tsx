import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, Space, Tooltip } from 'antd';
import {
  AndroidOutlined,
  AppleOutlined,
  CopyOutlined,
  DesktopOutlined,
  ImportOutlined,
} from '@ant-design/icons';

import { APP_ICONS } from './appIcons';
import type { AppPlatform, SubApp } from './subPageModel';

interface SubAppsTabProps {
  apps: Record<AppPlatform, SubApp[]>;
  initialPlatform: AppPlatform;
  onOpen: (url: string) => void;
  onCopy: (url: string, toast?: string) => void;
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

export default function SubAppsTab({
  apps,
  initialPlatform,
  onOpen,
  onCopy,
}: SubAppsTabProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<AppPlatform>(initialPlatform);

  const handleAppAction = (app: SubApp) => {
    if (app.isCopyOnly) {
      onCopy(app.copyUrl || app.url, app.toast);
      return;
    }
    onOpen(app.url);
  };

  return (
    <div className="sub-apps">
      <Segmented<AppPlatform>
        value={platform}
        onChange={setPlatform}
        options={PLATFORM_OPTIONS}
        style={{ marginBottom: 16 }}
      />
      <div className="sub-app-grid">
        {(apps[platform] || []).map((app) => (
          <div key={app.name} className="sub-row">
            <AppIcon name={app.name} />
            <span className="sub-app-name" style={{ fontWeight: 600 }}>
              {app.name}
            </span>
            <Space size="small">
              <Button
                type="primary"
                icon={<ImportOutlined />}
                size="middle"
                onClick={() => handleAppAction(app)}
              >
                {app.isCopyOnly ? '一键导入' : t('add')}
              </Button>
              <Tooltip title={t('copy')}>
                <Button
                  icon={<CopyOutlined />}
                  size="middle"
                  onClick={() => onCopy(app.copyUrl || app.url, app.toast)}
                />
              </Tooltip>
            </Space>
          </div>
        ))}
      </div>
    </div>
  );
}
