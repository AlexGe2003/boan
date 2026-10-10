import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, Space, Tooltip } from 'antd';
import {
  AndroidOutlined,
  AppleOutlined,
  CheckOutlined,
  CopyOutlined,
  DesktopOutlined,
  ImportOutlined,
  InfoCircleOutlined,
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

const PLATFORMS: { value: AppPlatform; label: string; icon: React.ReactNode }[] = [
  { value: 'windows', label: 'Windows', icon: <DesktopOutlined /> },
  { value: 'macos', label: 'macOS', icon: <AppleOutlined /> },
  { value: 'android', label: 'Android', icon: <AndroidOutlined /> },
  { value: 'ios', label: 'iOS', icon: <AppleOutlined /> },
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
  return <img className="sub-app-logo" src={icon.src} alt="" width={36} height={36} />;
}

export default function SubAppsTab({ apps, initialPlatform, onOpen, onCopy }: SubAppsTabProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<AppPlatform>(initialPlatform);
  const [copiedApp, setCopiedApp] = useState<string | null>(null);

  const platformOptions = useMemo(() => {
    return PLATFORMS.map((p) => ({
      value: p.value,
      label: (
        <span className="sub-platform-segment-item">
          {p.icon}
          <span>{p.label}</span>
          {p.value === initialPlatform && (
            <span className="sub-current-platform-badge">当前系统</span>
          )}
        </span>
      ),
    }));
  }, [initialPlatform]);

  const handleAppAction = (app: SubApp) => {
    if (app.isCopyOnly) {
      handleCopy(app);
      return;
    }
    onOpen(app.url);
  };

  const handleCopy = (app: SubApp) => {
    onCopy(app.copyUrl || app.url, app.toast);
    setCopiedApp(app.name);
    setTimeout(() => {
      setCopiedApp((curr) => (curr === app.name ? null : curr));
    }, 2000);
  };

  return (
    <div className="sub-apps">
      <p className="sub-muted">{t('subscription.importHelp')}</p>
      <Segmented<AppPlatform>
        value={platform}
        onChange={setPlatform}
        options={platformOptions}
        className="sub-platform-segmented"
        style={{ marginBottom: 16 }}
      />
      <div className="sub-app-grid">
        {(apps[platform] || []).map((app) => {
          const isCopied = copiedApp === app.name;
          return (
            <div key={app.name} className="sub-row sub-app-card">
              <AppIcon name={app.name} />
              <div className="sub-app-info">
                <span className="sub-app-name" style={{ fontWeight: 600 }}>
                  {app.name === 'Shadowrocket' ? t('subscription.rocketName') : app.name}
                </span>
                <span className="sub-app-desc">
                  {app.isCopyOnly ? '复制链接后打开应用添加' : '支持一键自动导入配置'}
                </span>
              </div>
              <Space size="small" className="sub-app-actions">
                <Button
                  type="primary"
                  icon={<ImportOutlined />}
                  size="middle"
                  className="sub-app-import-btn"
                  onClick={() => handleAppAction(app)}
                >
                  {t(app.isCopyOnly ? 'subscription.copySubscription' : 'subscription.openImport')}
                </Button>
                <Tooltip title={isCopied ? '已复制！' : t('subscription.copySubscription')}>
                  <Button
                    icon={
                      isCopied ? <CheckOutlined style={{ color: '#10b981' }} /> : <CopyOutlined />
                    }
                    className={isCopied ? 'sub-btn-copied' : ''}
                    aria-label={t('subscription.copySubscription')}
                    size="middle"
                    onClick={() => handleCopy(app)}
                  >
                    {isCopied ? (
                      <span style={{ color: '#10b981', marginLeft: 4 }}>已复制</span>
                    ) : null}
                  </Button>
                </Tooltip>
              </Space>
            </div>
          );
        })}
      </div>
      <div className="sub-apps-help-box">
        <InfoCircleOutlined className="sub-help-icon" />
        <span>{t('subscription.importFallback')}</span>
      </div>
    </div>
  );
}
