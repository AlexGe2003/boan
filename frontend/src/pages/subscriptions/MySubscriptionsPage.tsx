import ResetSubscriptionButton from './ResetSubscriptionButton';
import NodeStatus from '@/pages/support/NodeStatus';
import SubscriptionDevicePicker from './SubscriptionDevicePicker';
import zhCN from 'antd/locale/zh_CN';
import { ClusterOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { Alert, Button, ConfigProvider, Empty, Progress, Spin, Tag } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DashboardOutlined,
  LinkOutlined,
  LogoutOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import AppSidebar from '@/layouts/AppSidebar';
import PanelTopbar from '@/layouts/PanelTopbar';
import { useTheme } from '@/hooks/useTheme';
import { usePanelAccess } from '@/api/queries/usePanelRole';
import { HttpUtil } from '@/utils';
import './UserHome.css';
interface SubscriptionLink {
  email: string;
  planName?: string;
  configured: boolean;
  url: string;
  clashUrl?: string;
  used: number;
  up: number;
  down: number;
  total: number;
  remaining: number | null;
  expiryTime: number;
  enabled: boolean;
}
function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let index = -1;
  do {
    amount /= 1024;
    index++;
  } while (amount >= 1024 && index < 3);
  return `${amount.toFixed(2)} ${units[index]}`;
}
function expiry(value: number) {
  if (!value) return '长期有效';
  if (value < 0) return `首次使用后 ${Math.ceil(-value / 86400000)} 天`;
  return new Date(value).toLocaleDateString('zh-CN');
}
const sections = [
  { key: 'home', label: '仪表盘', icon: <DashboardOutlined />, group: '基础' },
  {
    key: 'subscription',
    label: '我的订阅',
    icon: <LinkOutlined />,
    group: '订阅',
  },
  { key: 'nodes', label: '节点状态', icon: <ClusterOutlined />, group: '订阅' },
];
export default function MySubscriptionsPage() {
  const { antdThemeConfig, isDark, isUltra } = useTheme();
  const access = usePanelAccess();
  const queryClient = useQueryClient();
  const nodesFetching = useIsFetching({queryKey: ['customer-node-status', access.userId]});
  const location = useLocation();
  const routeNavigate = useNavigate();
  const hash = location.hash.slice(1);
  const section = sections.some((item) => item.key === hash) ? hash : 'home';
  const [mobileNav, setMobileNav] = useState(false);
  const query = useQuery({
    queryKey: ['clients', 'mySubscriptions', access.userId],
    enabled: access.userId > 0,
    queryFn: async () => {
      const msg = await HttpUtil.get<SubscriptionLink[]>(
        '/panel/api/clients/mySubscriptions',
        undefined,
        { silent: true },
      );
      if (!msg.success) throw new Error(msg.msg || '无法加载用户信息');
      return msg.obj || [];
    },
    refetchInterval: 30000,
  });
  const logout = async () => {
    const result = await HttpUtil.post('/logout');
    if (result.success) window.location.href = `${window.X_UI_BASE_PATH || '/'}login`;
  };
  const navigate = (key: string) => {
    routeNavigate({ pathname: location.pathname, hash: key === 'home' ? '' : key });
    setMobileNav(false);
  };
  return (
    <ConfigProvider locale={zhCN} theme={antdThemeConfig}>
      <div
        className={`customer-app ${isDark ? 'is-dark' : 'is-light'}${isUltra ? ' is-ultra' : ''}`}
      >
        {access.roleKey !== 'customer' ? (
          <AppSidebar />
        ) : (
          <>
            {mobileNav && (
              <button
                className="customer-scrim"
                aria-label="关闭导航"
                onClick={() => setMobileNav(false)}
              />
            )}
            <aside className={`customer-sidebar ${mobileNav ? 'is-open' : ''}`}>

              <nav aria-label="用户导航">
                {sections.map((item, index) => (
                  <div key={item.key}>
                    {(index === 0 || sections[index - 1].group !== item.group) && (
                      <p>{item.group}</p>
                    )}
                    <button
                      aria-current={section === item.key ? "page" : undefined}
                      className={section === item.key ? 'active' : ''}
                      onClick={() => navigate(item.key)}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  </div>
                ))}
              </nav>

            </aside>
          </>
        )}
        <div className="customer-main">
          <PanelTopbar
            title={sections.find((item) => item.key === section)?.label || '用户中心'}
            identity=""
            onMenu={() => setMobileNav(true)}
            actions={
              <>
                <Button
                  type="text"
                  aria-label={section === 'nodes' ? '刷新节点状态' : '刷新账户信息'}
                  loading={section === 'nodes' ? nodesFetching > 0 : query.isFetching}
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    if (section === 'nodes') void queryClient.invalidateQueries({queryKey: ['customer-node-status', access.userId]});
                    else void query.refetch();
                  }}
                />
                <Button
                  type="text"
                  aria-label="退出登录"
                  icon={<LogoutOutlined />}
                  onClick={() => void logout()}
                />

              </>
            }
          />
          <main className="customer-content">
            {section === 'nodes' && (
              <NodeStatus />
            )}
            {['home', 'subscription'].includes(section) && query.isLoading && <Spin />}
            {['home', 'subscription'].includes(section) && query.isError && (
              <Alert
                type="error"
                title="加载失败"
                description={String(query.error)}
                action={<Button onClick={() => void query.refetch()}>重试</Button>}
              />
            )}
            {['home', 'subscription'].includes(section) && query.data?.length === 0 && (
              <section className="customer-card">
                <Empty description="还没有分配客户端配置，请联系管理员。" />
              </section>
            )}
            {['home', 'subscription'].includes(section) &&
              query.data?.map((item) => {
                if (!item.configured) {
                  return (
                    <section className="customer-card detail-card" key={item.email}>
                      <h2>我的服务</h2>
                      <Alert
                        type="info"
                        showIcon
                        title="尚未开通服务"
                        description="账号已创建。可以联系管理员分配服务，开通后可查看额度、有效期和订阅链接。"
                      />
                    </section>
                  );
                }
                const expired = item.expiryTime > 0 && item.expiryTime <= query.dataUpdatedAt;
                const depleted = item.total > 0 && item.used >= item.total;
                const available = item.enabled && !expired && !depleted;
                const status = !item.enabled
                  ? '已停用'
                  : expired
                    ? '已到期'
                    : depleted
                      ? '流量已用完'
                      : '使用中';
                return (
                  <div key={item.email}>
                    {section === 'home' && (
                      <div className="dashboard-overview">
                        <section className="customer-card dashboard-service">
                          <h2>服务概览 <Tag color={available ? 'green' : 'red'}>{status}</Tag></h2>
                          <dl className="dashboard-service-fields">
                            <div><dt>有效期</dt><dd>{expiry(item.expiryTime)}</dd></div>
                            <div><dt>流量额度</dt><dd>{item.total > 0 ? bytes(item.total) : '不限量'}</dd></div>
                          </dl>
                          {item.total > 0 && (
                            <div className="dashboard-quota">
                              <Progress aria-label="剩余流量比例" percent={Math.max(0, Math.min(100, (item.total - item.used) / item.total * 100))} showInfo={false} strokeColor={depleted ? '#ef6565' : '#2bc66c'} />
                              <span>剩余 {bytes(Math.max(0, item.total - item.used))}</span>
                            </div>
                          )}
                        </section>
                        <section className="customer-card dashboard-traffic">
                          <h2>流量使用情况</h2>
                          <dl className="dashboard-traffic-fields">
                            <div className="dashboard-total"><dt>累计使用</dt><dd>{bytes(item.used)}</dd></div>
                            <div><dt><ArrowUpOutlined /> 上传</dt><dd>{bytes(item.up || 0)}</dd></div>
                            <div><dt><ArrowDownOutlined /> 下载</dt><dd>{bytes(item.down || 0)}</dd></div>
                          </dl>
                        </section>
                        <div className="dashboard-links">
                          <section className="customer-card dashboard-link">
                            <LinkOutlined className="dashboard-link-icon" />
                            <div><h2>我的订阅</h2><p>导入客户端或复制订阅链接</p></div>
                            <Button type="primary" onClick={() => navigate('subscription')}>获取订阅</Button>
                          </section>
                          <section className="customer-card dashboard-link">
                            <ClusterOutlined className="dashboard-link-icon" />
                            <div><h2>节点状态</h2><p>查看已分配节点与配置状态</p></div>
                            <Button onClick={() => navigate('nodes')}>查看节点</Button>
                          </section>
                        </div>
                      </div>
                    )}
                    {section === 'subscription' && (
                      <section className="customer-card detail-card subscription-design-card">
                        <dl className="dashboard-service-fields subscription-quota-summary">
                          <div><dt>剩余流量</dt><dd>{item.total > 0 ? bytes(Math.max(0, item.total - item.used)) : '不限量'}</dd></div>
                          <div><dt>到期日期</dt><dd>{expiry(item.expiryTime)}</dd></div>
                        </dl>
                        {item.url ? (
                          <>
                            <SubscriptionDevicePicker key={item.url} url={item.url} clashUrl={item.clashUrl} />
                            {access.roleKey === 'customer' && <ResetSubscriptionButton />}
                          </>
                        ) : (
                          <Alert type="info" title="订阅尚未配置，请联系管理员。" />
                        )}
                      </section>
                    )}

                  </div>
                );
              })}

          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}
