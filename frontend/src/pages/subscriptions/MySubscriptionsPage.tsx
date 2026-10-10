import MyUsage from './MyUsage';
import MyDevices from './MyDevices';
import ResetSubscriptionButton from './ResetSubscriptionButton';
import NodeStatus from '@/pages/support/NodeStatus';
import SubscriptionDevicePicker from './SubscriptionDevicePicker';
import SubscriptionAuthorizations from './SubscriptionAuthorizations';
import zhCN from 'antd/locale/zh_CN';
import { ClusterOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { Alert, Button, ConfigProvider, Drawer, Empty, Progress, Spin, Tag } from 'antd';
import {
  UserOutlined,
  MenuOutlined,
  MoreOutlined,
  RightOutlined,
  LockOutlined,
  InfoCircleOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DashboardOutlined,
  BarChartOutlined,
  HistoryOutlined,
  LinkOutlined,
  LaptopOutlined,
  LogoutOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import AppSidebar from '@/layouts/AppSidebar';
import { useTheme } from '@/hooks/useTheme';
import { usePanelAccess } from '@/api/queries/usePanelRole';
import { HttpUtil } from '@/utils';
import './UserHome.css';
interface SubscriptionLink {
  email: string;
  planName?: string;
  limitHwid: number;
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
  { key: 'home', label: '概览', icon: <DashboardOutlined />, group: '基础' },
  {
    key: 'subscription',
    label: '我的订阅',
    icon: <LinkOutlined />,
    group: '订阅',
  },
  { key: 'usage', label: '用量', icon: <BarChartOutlined />, group: '订阅' },
  { key: 'devices', label: '设备', icon: <LaptopOutlined />, group: '订阅' },
  { key: 'records', label: '记录', icon: <HistoryOutlined />, group: '订阅' },
  { key: 'nodes', label: '节点状态', icon: <ClusterOutlined />, group: '订阅' },
];
export default function MySubscriptionsPage() {
  const { antdThemeConfig, isDark, isUltra } = useTheme();
  const access = usePanelAccess();
  const queryClient = useQueryClient();
  const nodesFetching = useIsFetching({ queryKey: ['customer-node-status'] });
  const usageFetching = useIsFetching({ queryKey: ['my-usage', access.userId] });
  const devicesFetching = useIsFetching({ queryKey: ['my-devices', access.userId] });
  const connectionsFetching = useIsFetching({ queryKey: ['my-connections', access.userId] });
  const location = useLocation();
  const routeNavigate = useNavigate();
  const hash = location.hash.slice(1);
  const section = sections.some(
    (item) =>
      item.key === hash &&
      (!['devices', 'usage', 'records'].includes(item.key) || access.roleKey === 'customer'),
  )
    ? hash
    : 'home';
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
  const title = sections.find((item) => item.key === section)?.label || '用户中心';
  const subtitle = {
    home: '查看你的服务、流量与连接配置',
    subscription: '选择平台与客户端，快速导入订阅',
    usage: '了解流量趋势与节点用量',
    devices: '查看在线连接与订阅客户端',
    records: '查看已采集的流量明细',
    nodes: '查看已分配节点与配置状态',
  }[section];
  const refresh = () => {
    if (section === 'nodes')
      void queryClient.invalidateQueries({ queryKey: ['customer-node-status'] });
    else if (['usage', 'records'].includes(section))
      void queryClient.invalidateQueries({ queryKey: ['my-usage', access.userId] });
    else if (section === 'devices') {
      void queryClient.invalidateQueries({ queryKey: ['my-devices', access.userId] });
      void queryClient.invalidateQueries({ queryKey: ['my-connections', access.userId] });
    } else {
      void query.refetch();
      if (section === 'subscription')
        void queryClient.invalidateQueries({ queryKey: ['my-devices', access.userId] });
    }
  };
  const refreshing =
    section === 'nodes'
      ? nodesFetching > 0
      : ['usage', 'records'].includes(section)
        ? usageFetching > 0
        : section === 'devices'
          ? devicesFetching + connectionsFetching > 0
          : query.isFetching;
  const navigation = (
    <nav aria-label="用户导航">
      {sections.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-label={item.label}
          aria-current={section === item.key ? 'page' : undefined}
          onClick={() => navigate(item.key)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        ...antdThemeConfig,
        token: {
          ...antdThemeConfig.token,
          colorPrimary: '#4169f5',
          borderRadius: 8,
          controlHeight: 40,
          fontSize: 14,
        },
      }}
    >
      <div
        className={`customer-app ${isDark ? 'is-dark' : 'is-light'}${isUltra ? ' is-ultra' : ''}`}
      >
        {access.roleKey !== 'customer' ? (
          <AppSidebar />
        ) : (
          <>
            <aside className="customer-sidebar">
              <div className="customer-brand">
                <UserOutlined />
                <strong>用户中心</strong>
              </div>
              {navigation}
              <Button
                type="text"
                className="customer-logout"
                icon={<LogoutOutlined />}
                onClick={() => void logout()}
              >
                退出登录
              </Button>
            </aside>
            <Drawer
              title="用户中心"
              placement="left"
              size={264}
              open={mobileNav}
              onClose={() => setMobileNav(false)}
              rootClassName="customer-nav-drawer"
            >
              {navigation}
              <Button type="text" icon={<LogoutOutlined />} onClick={() => void logout()}>
                退出登录
              </Button>
            </Drawer>
          </>
        )}
        <div className="customer-main">
          <header className="customer-header">
            <Button
              className="customer-menu-toggle"
              type="text"
              aria-label="打开菜单"
              icon={<MenuOutlined />}
              onClick={() => setMobileNav(true)}
            />
            <div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            {(section === 'home' || section === 'subscription') && (
              <Button
                className="customer-refresh"
                aria-label="刷新账户信息"
                loading={refreshing}
                icon={<ReloadOutlined />}
                onClick={refresh}
              >
                <span>刷新</span>
              </Button>
            )}
          </header>
          <main className="customer-content">
            {['usage', 'records'].includes(section) && access.roleKey === 'customer' && (
              <MyUsage
                userId={access.userId}
                records={section === 'records'}
                onRecords={() => navigate('records')}
              />
            )}

            {section === 'devices' && access.roleKey === 'customer' && (
              <MyDevices userId={access.userId} onSubscription={() => navigate('subscription')} />
            )}
            {section === 'nodes' && <NodeStatus />}
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
                          <h2>
                            服务概览 <Tag color={available ? 'green' : 'red'}>{status}</Tag>
                          </h2>
                          <p className="dashboard-quota-label">剩余流量</p>
                          <strong className="dashboard-quota-value">
                            {item.total > 0 ? bytes(Math.max(0, item.total - item.used)) : '不限量'}
                          </strong>
                          {item.total > 0 && (
                            <Progress
                              aria-label="剩余流量比例"
                              percent={Math.max(
                                0,
                                Math.min(100, ((item.total - item.used) / item.total) * 100),
                              )}
                              showInfo={false}
                              strokeColor={depleted ? '#ef6565' : '#5bc675'}
                            />
                          )}
                          <div className="dashboard-quota-meta">
                            <span>
                              已用 {bytes(item.used)} / 总量{' '}
                              {item.total > 0 ? bytes(item.total) : '不限量'}
                            </span>
                            <span>{expiry(item.expiryTime)}</span>
                          </div>
                          <Button
                            type="primary"
                            size="large"
                            className="dashboard-subscribe"
                            onClick={() => navigate('subscription')}
                          >
                            获取订阅
                          </Button>
                        </section>
                        <section className="customer-card dashboard-traffic">
                          <h2>流量使用情况</h2>
                          <dl className="dashboard-traffic-fields">
                            <div className="dashboard-total">
                              <dt>累计使用</dt>
                              <dd>{bytes(item.used)}</dd>
                            </div>
                            <div>
                              <dt>
                                <ArrowUpOutlined /> 上传
                              </dt>
                              <dd>{bytes(item.up || 0)}</dd>
                            </div>
                            <div>
                              <dt>
                                <ArrowDownOutlined /> 下载
                              </dt>
                              <dd>{bytes(item.down || 0)}</dd>
                            </div>
                          </dl>
                        </section>
                        <div className="dashboard-links">
                          {access.roleKey === 'customer' && (
                            <button className="dashboard-link" onClick={() => navigate('devices')}>
                              <LaptopOutlined className="dashboard-link-icon" />
                              <span>
                                <strong>我的设备</strong>
                                <small>查看在线来源与客户端</small>
                              </span>
                              <RightOutlined />
                            </button>
                          )}
                          <button className="dashboard-link" onClick={() => navigate('nodes')}>
                            <ClusterOutlined className="dashboard-link-icon" />
                            <span>
                              <strong>节点状态</strong>
                              <small>配置启用不代表实际连通</small>
                            </span>
                            <RightOutlined />
                          </button>
                        </div>
                      </div>
                    )}
                    {section === 'subscription' && (
                      <section className="customer-card detail-card subscription-design-card">
                        <dl className="dashboard-service-fields subscription-quota-summary">
                          <div>
                            <dt>剩余流量</dt>
                            <dd>
                              {item.total > 0
                                ? bytes(Math.max(0, item.total - item.used))
                                : '不限量'}
                            </dd>
                          </div>
                          <div>
                            <dt>有效期</dt>
                            <dd>{expiry(item.expiryTime)}</dd>
                          </div>
                        </dl>
                        {item.url ? (
                          <div className="subscription-workspace">
                            {access.roleKey === 'customer' && item.limitHwid > 0 ? (
                              <SubscriptionAuthorizations
                                key={item.url}
                                userId={access.userId}
                                url={item.url}
                                clashUrl={item.clashUrl}
                              />
                            ) : (
                              <SubscriptionDevicePicker
                                key={item.url}
                                url={item.url}
                                clashUrl={item.clashUrl}
                              />
                            )}
                            <aside className="subscription-management">
                              <h2>订阅管理</h2>
                              <p>
                                <LockOutlined /> 订阅链接仅供本人使用，请勿分享。
                              </p>
                              {access.roleKey === 'customer' && (
                                <div className="subscription-reset-section">
                                  <h3>重置订阅链接</h3>
                                  <p>重置后旧链接失效，需重新导入客户端。</p>
                                  <ResetSubscriptionButton />
                                  <small>点击后需再次确认。</small>
                                </div>
                              )}
                              <p className="subscription-reset-note">
                                <InfoCircleOutlined /> 流量和有效期保持不变。
                              </p>
                            </aside>
                          </div>
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
        {access.roleKey === 'customer' && (
          <nav className="customer-bottom-nav" aria-label="账户视图">
            {['home', 'subscription', 'usage', 'devices'].map((key) => {
              const item = sections.find((entry) => entry.key === key)!;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={key === 'subscription' ? '订阅' : item.label}
                  onClick={() => navigate(key)}
                  aria-current={
                    section === key || (key === 'usage' && section === 'records')
                      ? 'page'
                      : undefined
                  }
                >
                  {item.icon}
                  <span>{key === 'subscription' ? '订阅' : item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-expanded={mobileNav}
              aria-current={section === 'nodes' ? 'page' : undefined}
              onClick={() => setMobileNav(true)}
            >
              <MoreOutlined aria-hidden="true" />
              <span>更多</span>
            </button>
          </nav>
        )}
      </div>
    </ConfigProvider>
  );
}
