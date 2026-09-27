import { ConfigProvider, Layout } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppSidebar from '@/layouts/AppSidebar';
import { useTheme } from '@/hooks/useTheme';
import SupportTickets from './SupportTickets';
export default function SupportPage() {
  const { antdThemeConfig } = useTheme();
  return (
    <ConfigProvider theme={antdThemeConfig} locale={zhCN}>
      <Layout className="settings-page">
        <AppSidebar />
        <Layout className="content-shell">
          <Layout.Content className="content-area" style={{ padding: 24, minWidth: 0 }}>
            <SupportTickets admin />
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
