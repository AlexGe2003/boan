import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { z } from 'zod';
import { Alert, Button, Card, Skeleton, Tag } from 'antd';
import { ArrowRightOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { ClientsSummarySchema } from '@/generated/zod';
import { businessGet } from '@/pages/business/api';
import { OrdersSchema } from '@/schemas/commerce';
import { useSubscriptionPlans } from '@/pages/plans/api';
import './AdminOverview.css';

const summarySchema = z.object({ summary: ClientsSummarySchema });
const ticketsSchema = z.array(
  z.object({ id: z.number(), subject: z.string(), status: z.string() }),
);

export default function AdminOverview() {
  const { t } = useTranslation();
  const users = useQuery({
    queryKey: ['admin-overview', 'users'],
    queryFn: () => businessGet('clients/list/paged', summarySchema, { page: 1, pageSize: 1 }),
    staleTime: 30_000,
  });
  const orders = useQuery({
    queryKey: ['admin-overview', 'orders'],
    queryFn: () => businessGet('commerce/orders', OrdersSchema, { page: 1, status: 'pending' }),
    staleTime: 30_000,
  });
  const tickets = useQuery({
    queryKey: ['admin-overview', 'tickets'],
    queryFn: () => businessGet('support/tickets', ticketsSchema),
    staleTime: 30_000,
  });
  const plans = useSubscriptionPlans();
  const queries = [users, orders, tickets, plans];
  const busy = queries.some((q) => q.isFetching);
  const failed = queries.some((q) => q.isError);
  const tiles = [
    {
      key: 'users',
      title: t('adminOverview.users'),
      value: users.data?.summary.total,
      loading: users.isLoading,
      path: '/clients',
      detail: users.data
        ? t('adminOverview.online', { count: users.data.summary.onlineCount })
        : t('adminOverview.manageUsers'),
    },
    {
      key: 'plans',
      title: t('adminOverview.plans'),
      value: plans.data?.filter((p) => p.enabled).length,
      loading: plans.isLoading,
      path: '/plans',
      detail: t('adminOverview.managePlans'),
    },
    {
      key: 'orders',
      title: t('adminOverview.orders'),
      value: orders.data?.total,
      loading: orders.isLoading,
      path: '/orders',
      detail: t('adminOverview.confirmOrders'),
    },
    {
      key: 'tickets',
      title: t('adminOverview.tickets'),
      value: tickets.data?.filter((v) => v.status === '待处理').length,
      loading: tickets.isLoading,
      path: '/support',
      detail: t('adminOverview.ticketWindow'),
    },
  ];
  return (
    <section className="admin-overview" aria-label={t('adminOverview.title')}>
      <header className="admin-overview-heading">
        <div>
          <div className="admin-overview-eyebrow">BOAN · {t('adminOverview.admin')}</div>
          <h1>{t('adminOverview.title')}</h1>
          <p>{t('adminOverview.subtitle')}</p>
        </div>
        <div className="admin-overview-actions">
          <Button
            icon={<ReloadOutlined />}
            loading={busy}
            onClick={() => void Promise.all(queries.map((q) => q.refetch()))}
          >
            {t('refresh')}
          </Button>
          <Link to="/clients">
            <Button type="primary" icon={<PlusOutlined />}>
              {t('adminOverview.manageUsers')}
            </Button>
          </Link>
        </div>
      </header>
      {failed && <Alert type="warning" title={t('adminOverview.loadError')} />}
      <div className="admin-overview-grid">
        {tiles.map((tile) => (
          <Card key={tile.key} className="admin-overview-tile">
            <div className="admin-overview-label">{tile.title}</div>
            {tile.loading ? (
              <Skeleton.Input active size="small" />
            ) : (
              <div className="admin-overview-value">{tile.value ?? '—'}</div>
            )}
            <div className="admin-overview-detail">{tile.detail}</div>
          </Card>
        ))}
      </div>
      <div className="admin-overview-work">
        <Card title={t('adminOverview.shortcuts')}>
          <div className="admin-overview-sections">
            <div className="admin-overview-section-group">
              <div className="admin-overview-section-title">{t('adminOverview.operations')}</div>
              <div className="admin-overview-shortcuts">
                {[
                  {
                    path: '/clients',
                    title: t('adminOverview.manageUsers'),
                    desc: t('adminOverview.userHint'),
                  },
                  {
                    path: '/plans',
                    title: t('adminOverview.managePlans'),
                    desc: t('adminOverview.planHint'),
                  },
                ].map((item) => (
                  <Link key={item.path} to={item.path} className="admin-shortcut-card">
                    <strong>
                      {item.title}
                      <ArrowRightOutlined className="shortcut-arrow" />
                    </strong>
                    <span>{item.desc}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="admin-overview-section-group">
              <div className="admin-overview-section-title">{t('adminOverview.infrastructure')}</div>
              <div className="admin-overview-shortcuts">
                {[
                  {
                    path: '/node-groups',
                    title: t('adminOverview.nodeGroups'),
                    desc: t('adminOverview.groupHint'),
                  },
                  {
                    path: '/node-monitor',
                    title: t('adminOverview.monitor'),
                    desc: t('adminOverview.monitorHint'),
                  },
                ].map((item) => (
                  <Link key={item.path} to={item.path} className="admin-shortcut-card">
                    <strong>
                      {item.title}
                      <ArrowRightOutlined className="shortcut-arrow" />
                    </strong>
                    <span>{item.desc}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="admin-overview-section-group">
              <div className="admin-overview-section-title">{t('adminOverview.system')}</div>
              <div className="admin-overview-shortcuts">
                {[
                  {
                    path: '/settings',
                    title: t('menu.settings'),
                    desc: t('pages.settings.panelSettings'),
                  },
                  {
                    path: '/xray',
                    title: t('menu.xray'),
                    desc: t('menu.xray'),
                  },
                ].map((item) => (
                  <Link key={item.path} to={item.path} className="admin-shortcut-card">
                    <strong>
                      {item.title}
                      <ArrowRightOutlined className="shortcut-arrow" />
                    </strong>
                    <span>{item.desc}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <Card
          title={t('adminOverview.attention')}
          extra={<Link to="/support">{t('adminOverview.viewTickets')}</Link>}
        >
          <div className="admin-overview-tasks">
            <Link to="/orders" className="admin-task-item">
              <span>{t('adminOverview.confirmOrders')}</span>
              <Tag color={orders.data?.total ? 'orange' : undefined} className="admin-task-tag">
                {orders.data?.total ?? '—'}
              </Tag>
            </Link>
            {tickets.data
              ?.filter((v) => v.status === '待处理')
              .slice(0, 3)
              .map((ticket) => (
                <Link to="/support" key={ticket.id} className="admin-task-item">
                  <span>{ticket.subject}</span>
                  <ArrowRightOutlined />
                </Link>
              ))}
            {tickets.isSuccess && !tickets.data.some((v) => v.status === '待处理') && (
              <p>{t('adminOverview.noTickets')}</p>
            )}
            <p className="admin-overview-note">{t('adminOverview.ticketWindow')}</p>
          </div>
        </Card>
      </div>
    </section>
  );
}
