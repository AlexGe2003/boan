import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, theme } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { useTheme } from '@/hooks/useTheme';
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
  const { t } = useTranslation();
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
        {actions}
      </div>
    </header>
  );
}
