import NodeStatus from '@/pages/support/NodeStatus';
import SupportTickets from '@/pages/support/SupportTickets';
import zhCN from 'antd/locale/zh_CN';
import { ClusterOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, ConfigProvider, Empty, Modal, Progress, Spin, Tag, message } from 'antd';
import {
  AndroidOutlined,
  AppleOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BookOutlined,
  CopyOutlined,
  DashboardOutlined,
  GlobalOutlined,
  LaptopOutlined,
  LinkOutlined,
  LogoutOutlined,
  ReloadOutlined,
  UserOutlined,
  WindowsOutlined,
} from '@ant-design/icons';
import AppSidebar from '@/layouts/AppSidebar';
import PanelTopbar from '@/layouts/PanelTopbar';
import { useTheme } from '@/hooks/useTheme';
import { usePanelAccess } from '@/api/queries/usePanelRole';
import { ClipboardManager, HttpUtil } from '@/utils';
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
  { key: 'profile', label: '个人中心', icon: <UserOutlined />, group: '账户' },
  { key: 'guide', label: '使用教程', icon: <BookOutlined />, group: '支持' },
  { key: 'tickets', label: '工单服务', icon: <CustomerServiceOutlined />, group: '支持' },
];
const platforms = [
  { name: 'Windows', icon: <WindowsOutlined />, format: 'Clash / Mihomo' },
  { name: 'Android', icon: <AndroidOutlined />, format: '通用订阅' },
  { name: 'iOS', icon: <AppleOutlined />, format: 'Shadowrocket / 小火箭' },
  { name: 'macOS', icon: <LaptopOutlined />, format: 'Clash / Mihomo' },
];
export default function MySubscriptionsPage() {
  const { antdThemeConfig, isDark, isUltra } = useTheme();
  const access = usePanelAccess();
  const location = useLocation();
  const routeNavigate = useNavigate();
  const hash = location.hash.slice(1);
  const section = sections.some((item) => item.key === hash) ? hash : 'home';
  const [mobileNav, setMobileNav] = useState(false);
  const [platform, setPlatform] = useState<(typeof platforms)[number] | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const query = useQuery({
    queryKey: ['clients', 'mySubscriptions', access.userId],
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
  const copy = async (value: string) => {
    if (await ClipboardManager.copyText(value)) messageApi.success('订阅链接已复制');
    else messageApi.error('复制失败，请检查剪贴板权限');
  };
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
      {contextHolder}
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
              <a className="customer-brand" href={window.X_UI_BASE_PATH || '/'}>
                <GlobalOutlined />
                <strong>BOAN</strong>
                <span>泊岸网络</span>
              </a>
              <nav aria-label="用户导航">
                {sections.map((item, index) => (
                  <div key={item.key}>
                    {(index === 0 || sections[index - 1].group !== item.group) && (
                      <p>{item.group}</p>
                    )}
                    <button
                      className={section === item.key ? 'active' : ''}
                      onClick={() => navigate(item.key)}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  </div>
                ))}
              </nav>
              <div className="customer-sidebar-bottom">
                <span className="connection-dot" />
                专属用户空间<small>您的连接，尽在掌握</small>
              </div>
            </aside>
          </>
        )}
        <div className="customer-main">
          <PanelTopbar
            title={sections.find((item) => item.key === section)?.label || '用户中心'}
            identity="订阅用户"
            onMenu={() => setMobileNav(true)}
            actions={
              <>
                <Button
                  type="text"
                  aria-label="刷新用量"
                  loading={query.isFetching}
                  icon={<ReloadOutlined />}
                  onClick={() => void query.refetch()}
                />
                <Button
                  type="text"
                  aria-label="退出登录"
                  icon={<LogoutOutlined />}
                  onClick={() => void logout()}
                />
                <button
                  className="customer-avatar"
                  aria-label="个人中心"
                  onClick={() => navigate('profile')}
                >
                  <UserOutlined />
                </button>
              </>
            }
          />
          <main className="customer-content">
            {section === 'nodes' && (
              <section className="customer-card">
                <NodeStatus />
              </section>
            )}
            {section === 'tickets' && (
              <section className="customer-card">
                <SupportTickets />
              </section>
            )}
            {['home', 'subscription', 'profile'].includes(section) && query.isLoading && <Spin />}
            {['home', 'subscription', 'profile'].includes(section) && query.isError && (
              <Alert
                type="error"
                title="加载失败"
                description={String(query.error)}
                action={<Button onClick={() => void query.refetch()}>重试</Button>}
              />
            )}
            {['home', 'subscription', 'profile'].includes(section) && query.data?.length === 0 && (
              <section className="customer-card">
                <Empty description="还没有分配客户端配置，请联系管理员。" />
              </section>
            )}
            {['home', 'subscription', 'profile'].includes(section) &&
              query.data?.map((item) => {
                if (!item.configured) {
                  return (
                    <section className="customer-card detail-card" key={item.email}>
                      <h2>{section === 'profile' ? '账户信息' : '我的服务'}</h2>
                      <p>用户账号：{item.email}</p>
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
                      <div className="customer-stats">
                        <section className="customer-card quota-card">
                          <h2>
                            我的套餐 <Tag color={available ? 'green' : 'red'}>{status}</Tag>
                          </h2>
                          <h3>{item.planName || '管理员配置的订阅'}</h3>
                          <p className="quota-expiry">{expiry(item.expiryTime)}</p>
                          <Progress
                            aria-label="剩余流量比例"
                            percent={
                              item.total > 0
                                ? Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      ((item.remaining ?? Math.max(0, item.total - item.used)) /
                                        item.total) *
                                        100,
                                    ),
                                  )
                                : 100
                            }
                            showInfo={false}
                            strokeColor={depleted ? '#ef6565' : '#2bc66c'}
                          />
                          <strong className="quota-summary">
                            剩余 {item.remaining === null ? '不限量' : bytes(item.remaining)}{' '}
                            <span>/ 总计 {item.total > 0 ? bytes(item.total) : '不限量'}</span>
                          </strong>
                        </section>
                        <section className="customer-card">
                          <h2>流量使用</h2>
                          <dl className="traffic-list">
                            <div>
                              <dt>
                                <ArrowUpOutlined className="up" /> 上行流量
                              </dt>
                              <dd>{bytes(item.up || 0)}</dd>
                            </div>
                            <div>
                              <dt>
                                <ArrowDownOutlined className="down" /> 下行流量
                              </dt>
                              <dd>{bytes(item.down || 0)}</dd>
                            </div>
                            <div>
                              <dt>
                                <span className="total-mark" /> 总计使用
                              </dt>
                              <dd>{bytes(item.used)}</dd>
                            </div>
                          </dl>
                        </section>
                      </div>
                    )}
                    {section === 'subscription' && (
                      <section className="customer-card detail-card">
                        <h2>
                          <LinkOutlined /> {item.email}{' '}
                          <Tag color={available ? 'green' : 'red'}>{status}</Tag>
                        </h2>
                        <p className="muted">复制链接后，在兼容客户端中选择“从 URL 导入订阅”。</p>
                        {item.url ? (
                          <div className="subscription-actions">
                            <Button
                              type="primary"
                              icon={<CopyOutlined />}
                              onClick={() => void copy(item.url)}
                            >
                              复制通用订阅
                            </Button>
                            <Button
                              onClick={() => {
                                const url = new URL(item.url, window.location.origin);
                                url.searchParams.set('flag', 'shadowrocket');
                                void copy(url.toString());
                              }}
                            >
                              复制小火箭订阅
                            </Button>
                            {item.clashUrl && (
                              <Button onClick={() => void copy(item.clashUrl!)}>
                                复制 Clash / Mihomo 订阅
                              </Button>
                            )}
                            <p>订阅链接包含您的专属访问凭据，请勿分享给他人。</p>
                          </div>
                        ) : (
                          <Alert type="info" title="订阅尚未配置，请联系管理员。" />
                        )}
                      </section>
                    )}
                    {section === 'profile' && (
                      <section className="customer-card detail-card">
                        <h2>账户与服务信息</h2>
                        <dl className="profile-list">
                          {[
                            ['用户标识', item.email],
                            ['服务状态', status],
                            ['到期时间', expiry(item.expiryTime)],
                            ['总流量额度', item.total ? bytes(item.total) : '不限量'],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                        <Alert type="info" title="修改密码、调整流量或续期，请联系您的管理员。" />
                      </section>
                    )}
                  </div>
                );
              })}
            {section === 'guide' && (
              <>
                <section className="customer-card clients-card">
                  <h2>
                    客户端使用指南 <span>选择您的设备</span>
                  </h2>
                  <div className="platform-grid">
                    <button onClick={() => navigate('guide')}>
                      <span>
                        <BookOutlined />
                      </span>
                      使用教程
                    </button>
                    {platforms.map((item) => (
                      <button key={item.name} onClick={() => setPlatform(item)}>
                        <span>{item.icon}</span>
                        {item.name}
                      </button>
                    ))}
                  </div>
                </section>
                {section === 'guide' && (
                  <section className="customer-card detail-card">
                    <h2>快速开始</h2>
                    <ol className="customer-guide">
                      <li>
                        <h3>准备兼容客户端</h3>
                        <p>
                          Windows / macOS 可使用 Clash / Mihomo；iOS 可使用
                          Shadowrocket（小火箭），在“我的订阅”复制对应链接后导入。
                        </p>
                      </li>
                      <li>
                        <h3>导入专属订阅</h3>
                        <p>打开“我的订阅”，复制相应链接，在客户端中选择“从 URL 导入”。</p>
                      </li>
                      <li>
                        <h3>更新并连接</h3>
                        <p>
                          更新订阅、选择可用节点并启用连接。如无法连接，请检查流量余量与有效期。
                        </p>
                      </li>
                    </ol>
                    <Button type="primary" onClick={() => navigate('subscription')}>
                      打开我的订阅
                    </Button>
                  </section>
                )}
              </>
            )}
            <footer className="customer-footer">
              <span>BOAN · 泊岸网络</span>
              <span>您的专属连接空间</span>
            </footer>
          </main>
        </div>
      </div>
      <Modal
        title={`${platform?.name || ''} 使用指南`}
        open={!!platform}
        onCancel={() => setPlatform(null)}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setPlatform(null);
              navigate('subscription');
            }}
          >
            前往我的订阅
          </Button>
        }
      >
        <p>1. 安装支持 {platform?.format} 的可信客户端。</p>
        <p>2. 在“我的订阅”中复制匹配的订阅链接。</p>
        <p>3. 在客户端选择从 URL 导入，粘贴链接并更新。</p>
        <p>4. 选择节点并连接。切勿将订阅链接发送给他人。</p>
      </Modal>
    </ConfigProvider>
  );
}
