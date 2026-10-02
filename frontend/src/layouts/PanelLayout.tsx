import { Navigate, Outlet, useLocation } from 'react-router';
import { Button, ConfigProvider, Result } from 'antd';
import { useTranslation } from 'react-i18next';

import { usePanelAccess } from '@/api/queries/usePanelRole';
import { useWebSocketBridge } from '@/api/websocketBridge';
import { userPathBlocked } from '@/layouts/nav-role';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTheme } from '@/hooks/useTheme';
import CommandPalette from '@/components/command-palette/CommandPalette';

function PanelBridge() {
  useWebSocketBridge();
  return <CommandPalette />;
}

export default function PanelLayout() {
  const { antdThemeConfig } = useTheme();
  const { t } = useTranslation();
  usePageTitle();
  const access = usePanelAccess();
  const { pathname } = useLocation();
  if (access.role === 'loading') return null;
  if (access.role === 'error') {
    return (
      <Result
        status="error"
        title={t('somethingWentWrong')}
        extra={<Button onClick={() => window.location.reload()}>{t('refresh')}</Button>}
      />
    );
  }
  if (userPathBlocked(access.role, pathname, access.pages)) {
    return <Navigate to={access.pages[0] || '/'} replace />;
  }
  return (
    <ConfigProvider theme={antdThemeConfig}>
      <Outlet />
      {access.roleKey !== 'customer' && <PanelBridge />}
    </ConfigProvider>
  );
}
