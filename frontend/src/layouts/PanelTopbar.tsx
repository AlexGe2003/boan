import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip, theme } from 'antd';
import { GlobalOutlined, MenuOutlined } from '@ant-design/icons';
import { useTheme } from '@/hooks/useTheme';
import { LanguageManager } from '@/utils';
import './PanelTopbar.css';

export default function PanelTopbar({
  title,
  identity,
  onMenu,
  actions,
  fixed = false,
}: {
  title: string;
  identity: string;
  onMenu: () => void;
  actions: ReactNode;
  fixed?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const { antdThemeConfig } = useTheme();
  return (
    <header
      className={`panel-topbar${fixed ? ' panel-topbar-fixed' : ''}`}
      style={{
        background: antdThemeConfig.components?.Layout?.headerBg ?? token.colorBgContainer,
        color: token.colorText,
        borderColor: token.colorBorderSecondary,
      }}
    >
      <Button
        className="panel-menu-toggle"
        type="text"
        aria-label={t('menu.openMenu')}
        icon={<MenuOutlined />}
        onClick={onMenu}
      />
      <h1>{title}</h1>
      <div className="panel-topbar-actions">
        <span className="panel-identity">{identity}</span>
        <Tooltip title={i18n.language === 'en-US' ? '切换为简体中文' : 'Switch to English'}>
          <Button
            type="text"
            icon={<GlobalOutlined />}
            aria-label="切换语言"
            onClick={() =>
              LanguageManager.setLanguage(i18n.language === 'en-US' ? 'zh-CN' : 'en-US')
            }
          />
        </Tooltip>
        {actions}
      </div>
    </header>
  );
}
