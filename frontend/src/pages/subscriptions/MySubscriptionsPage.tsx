import MyUsage from './MyUsage';
import MyDevices from './MyDevices';
import ResetSubscriptionButton from './ResetSubscriptionButton';
import NodeStatus from '@/pages/support/NodeStatus';
import SubscriptionDevicePicker from './SubscriptionDevicePicker';
import SubscriptionAuthorizations from './SubscriptionAuthorizations';
import zhCN from 'antd/locale/zh_CN';
import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { Alert, Badge, Button, ConfigProvider, Drawer, Empty, Progress, Skeleton, Tag } from 'antd';
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
  NotificationOutlined,
  ClusterOutlined,
} from '@ant-design/icons';
import AppSidebar from '@/layouts/AppSidebar';
import { useTheme } from '@/hooks/useTheme';
import { usePanelAccess } from '@/api/queries/usePanelRole';
import { HttpUtil } from '@/utils';
import AnnouncementModal from './AnnouncementModal';
import AnnouncementsView from './AnnouncementsView';
import type { Announcement } from '@/models/announcement';
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
  { key: 'announcements', label: '系统公告', icon: <NotificationOutlined />, group: '订阅' },
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

  const readKey = `boan_read_announcements:${access.userId}`;
  const loadReadIds = (): number[] => {
    try {
      const raw = localStorage.getItem(readKey);
      const value: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      return [];
    }
  };
  const [readState, setReadState] = useState(() => ({ key: readKey, ids: loadReadIds() }));
  if (readState.key !== readKey) setReadState({ key: readKey, ids: loadReadIds() });
  const readIds = useMemo(
    () => (readState.key === readKey ? readState.ids : []),
    [readState, readKey],
  );
  const saveReadIds = (ids: number[]) => {
    setReadState({ key: readKey, ids });
    try {
      localStorage.setItem(readKey, JSON.stringify(ids));
    } catch {
      // Keep read state for this visit when browser storage is unavailable.
    }
  };

  const announcementsQuery = useQuery({
    queryKey: ['announcements'],
    enabled: access.userId > 0,
    queryFn: async () => {
      const res = await HttpUtil.get<Announcement[]>('/panel/api/announcements');
      return res.success ? res.obj || [] : [];
    },
    refetchInterval: 60000,
  });

  const markRead = (id: number) => {
    if (!readIds.includes(id)) saveReadIds([...readIds, id]);
  };

  const markAllRead = () => {
    const allIds = (announcementsQuery.data || []).map((a) => a.id);
    saveReadIds(allIds);
  };

  const unreadCount = useMemo(() => {
    return (announcementsQuery.data || []).filter((a) => !readIds.includes(a.id)).length;
  }, [announcementsQuery.data, readIds]);

  const unreadPopup = useMemo(() => {
    if (!announcementsQuery.data) return null;
    return announcementsQuery.data.find((a) => a.popup && !readIds.includes(a.id)) || null;
  }, [announcementsQuery.data, readIds]);

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
    announcements: '浏览所有系统通知、网络维护与更新说明',
    usage: '了解流量趋势与节点用量',
    devices: '查看连接状态与使用的客户端',
    records: '查看已采集的流量明细',
    nodes: '查看已分配节点与配置状态',
  }[section];
  const refresh = () => {
    if (section === 'nodes')
      void queryClient.invalidateQueries({ queryKey: ['customer-node-status'] });
    else if (section === 'announcements') void announcementsQuery.refetch();
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
      : section === 'announcements'
        ? announcementsQuery.isFetching
        : ['usage', 'records'].includes(section)
          ? usageFetching > 0
          : section === 'devices'
            ? devicesFetching + connectionsFetching > 0
            : query.isFetching;
  const navigation = (
    <nav aria-label="用户导航">
      {sections.map((item) => {
        const isAnnounce = item.key === 'announcements';
        const hasUnread = isAnnounce && unreadCount > 0;
        return (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            aria-current={section === item.key ? 'page' : undefined}
            onClick={() => navigate(item.key)}
          >
            {item.icon}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {item.label}
              {hasUnread && (
                <Badge count={unreadCount} size="small" style={{ backgroundColor: '#ff4d4f' }} />
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
  return (
    <ConfigProvider locale={zhCN} theme={antdThemeConfig}>
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
            {(section === 'home' || section === 'subscription' || section === 'announcements') && (
              <Button
                className="customer-refresh"
                aria-label="刷新信息"
                loading={refreshing}
                icon={<ReloadOutlined />}
                onClick={refresh}
              >
                <span>刷新</span>
              </Button>
            )}
          </header>
          <main className="customer-content">
            {section === 'announcements' && (
              <AnnouncementsView
                announcements={announcementsQuery.data || []}
                loading={announcementsQuery.isLoading}
                readIds={readIds}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
              />
            )}
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
            {['home', 'subscription'].includes(section) && query.isLoading && (
              <div className="customer-skeleton-grid">
                <div className="customer-card customer-skeleton-card">
                  <Skeleton active paragraph={{ rows: 4 }} title={{ width: 160 }} />
                </div>
                <div className="customer-card customer-skeleton-card">
                  <Skeleton active paragraph={{ rows: 3 }} title={{ width: 140 }} />
                </div>
              </div>
            )}
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
                          <div className="dashboard-service-header">
                            <div>
                              <h2 className="dashboard-service-title">
                                服务概览
                                <Tag
                                  color={
                                    available
                                      ? 'success'
                                      : expired || depleted
                                        ? 'error'
                                        : 'default'
                                  }
                                  className="dashboard-status-tag"
                                >
                                  <span
                                    className={`status-dot ${available ? 'is-online' : 'is-offline'}`}
                                  />
                                  {status}
                                </Tag>
                              </h2>
                              {item.planName && (
                                <span className="dashboard-plan-pill">{item.planName}</span>
                              )}
                            </div>
                          </div>

                          <div className="dashboard-quota-wrap">
                            <span className="dashboard-quota-label">剩余流量</span>
                            <div className="dashboard-quota-row">
                              <strong className="dashboard-quota-value">
                                {item.total > 0
                                  ? bytes(Math.max(0, item.total - item.used))
                                  : '不限量'}
                              </strong>
                              {item.total > 0 && (
                                <span className="dashboard-quota-percent-tag">
                                  {Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      Math.round(((item.total - item.used) / item.total) * 100),
                                    ),
                                  )}
                                  % 可用
                                </span>
                              )}
                            </div>
                            {item.total > 0 && (
                              <Progress
                                aria-label="剩余流量比例"
                                percent={Math.max(
                                  0,
                                  Math.min(100, ((item.total - item.used) / item.total) * 100),
                                )}
                                showInfo={false}
                                strokeColor={
                                  depleted
                                    ? '#ef4444'
                                    : (item.total - item.used) / item.total < 0.15
                                      ? '#f59e0b'
                                      : '#10b981'
                                }
                                className="dashboard-service-progress"
                              />
                            )}
                          </div>

                          <div className="dashboard-quota-stats">
                            <div className="dashboard-quota-stat-item">
                              <span className="stat-label">已用流量</span>
                              <strong className="stat-value">{bytes(item.used)}</strong>
                            </div>
                            <div className="dashboard-quota-stat-item">
                              <span className="stat-label">配额总量</span>
                              <strong className="stat-value">
                                {item.total > 0 ? bytes(item.total) : '不限量'}
                              </strong>
                            </div>
                            <div className="dashboard-quota-stat-item">
                              <span className="stat-label">到期时间</span>
                              <strong className="stat-value">{expiry(item.expiryTime)}</strong>
                            </div>
                          </div>

                          <Button
                            type="primary"
                            size="large"
                            icon={<RightOutlined />}
                            iconPosition="end"
                            className="dashboard-subscribe"
                            onClick={() => navigate('subscription')}
                          >
                            获取 / 导入订阅
                          </Button>
                        </section>

                        <section className="customer-card dashboard-traffic">
                          <div className="dashboard-traffic-header">
                            <h2>流量使用情况</h2>
                            <span className="dashboard-traffic-sub">当前账户已用流量统计</span>
                          </div>
                          <dl className="dashboard-traffic-fields">
                            <div className="dashboard-total dashboard-traffic-tile">
                              <div className="traffic-tile-icon total-icon">
                                <BarChartOutlined />
                              </div>
                              <div className="traffic-tile-content">
                                <dt>累计使用</dt>
                                <dd>{bytes(item.used)}</dd>
                              </div>
                            </div>
                            <div className="dashboard-traffic-tile">
                              <div className="traffic-tile-icon up-icon">
                                <ArrowUpOutlined />
                              </div>
                              <div className="traffic-tile-content">
                                <dt>上传</dt>
                                <dd>{bytes(item.up || 0)}</dd>
                              </div>
                            </div>
                            <div className="dashboard-traffic-tile">
                              <div className="traffic-tile-icon down-icon">
                                <ArrowDownOutlined />
                              </div>
                              <div className="traffic-tile-content">
                                <dt>下载</dt>
                                <dd>{bytes(item.down || 0)}</dd>
                              </div>
                            </div>
                          </dl>
                        </section>

                        <div className="dashboard-links">
                          {access.roleKey === 'customer' && (
                            <button className="dashboard-link" onClick={() => navigate('devices')}>
                              <div className="dashboard-link-icon-wrap device-icon">
                                <LaptopOutlined />
                              </div>
                              <span className="dashboard-link-text">
                                <strong>我的设备</strong>
                                <small>查看在线来源与客户端</small>
                              </span>
                              <RightOutlined className="dashboard-link-arrow" />
                            </button>
                          )}
                          <button className="dashboard-link" onClick={() => navigate('nodes')}>
                            <div className="dashboard-link-icon-wrap node-icon">
                              <ClusterOutlined />
                            </div>
                            <span className="dashboard-link-text">
                              <strong>节点状态</strong>
                              <small>配置启用不代表实际连通</small>
                            </span>
                            <RightOutlined className="dashboard-link-arrow" />
                          </button>
                        </div>
                      </div>
                    )}
                    {section === 'subscription' && (
                      <section className="customer-card detail-card subscription-design-card customer-subscription">
                        <dl className="dashboard-service-fields subscription-quota-summary">
                          <div className="subscription-quota-item">
                            <dt>剩余流量</dt>
                            <dd>
                              {item.total > 0
                                ? bytes(Math.max(0, item.total - item.used))
                                : '不限量'}
                            </dd>
                            {item.total > 0 && (
                              <span className="subscription-quota-sub">
                                已用 {bytes(item.used)} / 总量 {bytes(item.total)}
                              </span>
                            )}
                          </div>
                          <div className="subscription-quota-item">
                            <dt>有效期</dt>
                            <dd>{expiry(item.expiryTime)}</dd>
                            <span className="subscription-quota-sub">
                              {item.expiryTime > 0
                                ? item.expiryTime <= query.dataUpdatedAt
                                  ? '服务已过期'
                                  : `距到期约 ${Math.max(1, Math.ceil((item.expiryTime - query.dataUpdatedAt) / 86400000))} 天`
                                : '长期有效套餐'}
                            </span>
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
                              <div className="subscription-management-header">
                                <h2>订阅管理</h2>
                              </div>
                              <div className="subscription-security-card">
                                <div className="security-icon-wrap">
                                  <LockOutlined />
                                </div>
                                <div className="security-text">
                                  <strong>个人专属安全链接</strong>
                                  <p>
                                    订阅链接包含您的节点配置与密钥，仅限本人使用，请勿分享或公开。
                                  </p>
                                </div>
                              </div>
                              {access.roleKey === 'customer' && (
                                <div className="subscription-reset-section">
                                  <h3>重置订阅链接</h3>
                                  <p>若怀疑链接泄露，重置后旧链接即刻失效，需重新导入客户端。</p>
                                  <ResetSubscriptionButton />
                                  <small>
                                    <InfoCircleOutlined /> 重置后剩余流量和有效期完全保持不变。
                                  </small>
                                </div>
                              )}
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
        <AnnouncementModal
          open={!!unreadPopup}
          announcement={unreadPopup}
          onAcknowledge={(id) => markRead(id)}
          onViewAll={() => navigate('announcements')}
        />
      </div>
    </ConfigProvider>
  );
}
