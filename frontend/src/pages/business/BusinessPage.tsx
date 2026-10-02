import { ConfigProvider, Layout } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import '@/pages/business/business.css';
import AppSidebar from '@/layouts/AppSidebar';
import { useTheme } from '@/hooks/useTheme';
import NodeGroups from './NodeGroups';
import Orders from './Orders';
export default function BusinessPage({ section }: { section: 'groups' | 'orders' }) {
  const { antdThemeConfig, isDark, isUltra } = useTheme();
  return (
    <ConfigProvider theme={antdThemeConfig} locale={zhCN}>
      <Layout
        className={`settings-page business-page${isDark ? ' is-dark' : ''}${isUltra ? ' is-ultra' : ''}`}
      >
        <AppSidebar />
        <Layout className="content-shell">
          <Layout.Content className="content-area" style={{ padding: 24, minWidth: 0 }}>
            {section === 'groups' ? <NodeGroups /> : <Orders admin />}
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
