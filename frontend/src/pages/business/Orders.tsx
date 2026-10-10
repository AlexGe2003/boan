import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Grid,
  List,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { money, periodName, type Order } from '@/schemas/commerce';
import { businessPost, useOrders } from './api';
import './Orders.css';

const states = {
  pending: '待付款确认',
  paid: '已收款待开通',
  failed: '开通失败',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已过期',
};

const colors: Record<string, string> = {
  pending: 'gold',
  paid: 'blue',
  failed: 'red',
  completed: 'green',
  cancelled: 'default',
  expired: 'default',
};

function getStatusTag(status: string) {
  let icon = <ClockCircleOutlined />;
  if (status === 'completed') icon = <CheckCircleOutlined />;
  else if (status === 'failed' || status === 'cancelled') icon = <CloseCircleOutlined />;
  else if (status === 'paid') icon = <SyncOutlined spin />;

  return (
    <Tag
      color={colors[status] || 'default'}
      icon={icon}
      style={{ borderRadius: 6, fontWeight: 500 }}
    >
      {states[status as keyof typeof states] || status}
    </Tag>
  );
}

function date(value: number) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

export default function Orders({ admin = false }: { admin?: boolean }) {
  const cache = useQueryClient();
  const screens = Grid.useBreakpoint();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const orders = useOrders(page, status);
  const [selected, setSelected] = useState<Order>();
  const [confirming, setConfirming] = useState<Order>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filteredItems = useMemo(() => {
    const list = orders.data?.items ?? [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter(
      (item) =>
        item.id.toLowerCase().includes(term) ||
        (item.planName || '').toLowerCase().includes(term) ||
        (item.userId && String(item.userId).includes(term)) ||
        (item.paymentNote && item.paymentNote.toLowerCase().includes(term)),
    );
  }, [orders.data?.items, search]);

  const stats = useMemo(() => {
    const list = orders.data?.items ?? [];
    const total = orders.data?.total || list.length;
    const pending = list.filter((o) => o.status === 'pending').length;
    const completed = list.filter((o) => o.status === 'completed').length;
    const failedOrCancelled = list.filter(
      (o) => o.status === 'failed' || o.status === 'cancelled',
    ).length;
    return { total, pending, completed, failedOrCancelled };
  }, [orders.data?.items, orders.data?.total]);

  async function act(order: Order, action: 'cancel' | 'confirm') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await businessPost(
        `commerce/orders/${order.id}/${action}`,
        action === 'confirm' ? { note: note.trim() } : {},
      );
      setConfirming(undefined);
      setSelected(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['commerce-orders'] }),
        cache.invalidateQueries({ queryKey: ['clients'] }),
        cache.invalidateQueries({ queryKey: ['subscription-plan-assignments'] }),
      ]);
      setBusy(false);
    }
  }

  return (
    <div className="orders-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Typography.Title level={admin ? 2 : 3} style={{ margin: 0 }}>
          {admin ? '订单管理' : '我的订单'}
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          loading={orders.isFetching}
          onClick={() => void orders.refetch()}
        >
          刷新订单
        </Button>
      </div>

      <div className="orders-stats-grid">
        <div className="orders-stat-card">
          <span className="orders-stat-label">总订单数</span>
          <span className="orders-stat-value">{stats.total}</span>
        </div>
        <div className="orders-stat-card">
          <span className="orders-stat-label">待付款确认</span>
          <span className="orders-stat-value" style={{ color: '#d48806' }}>
            {stats.pending}
          </span>
        </div>
        <div className="orders-stat-card">
          <span className="orders-stat-label">已完成开通</span>
          <span className="orders-stat-value" style={{ color: '#52c41a' }}>
            {stats.completed}
          </span>
        </div>
        <div className="orders-stat-card">
          <span className="orders-stat-label">异常 / 取消</span>
          <span className="orders-stat-value" style={{ color: '#ff4d4f' }}>
            {stats.failedOrCancelled}
          </span>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        title="收款与开通提示"
        description="同套餐续期从当前到期时间（已到期则从确认日）延长；换套餐从确认日计算。当前购买与续期保留已用流量，不自动清零。待确认订单 30 分钟过期。"
      />

      {error && !confirming && (
        <Alert type="error" title={error} closable onClose={() => setError('')} showIcon />
      )}

      <Card
        title="订单列表"
        extra={
          <Space wrap>
            <Input
              prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />}
              placeholder="搜索订单号 / 套餐 / 用户..."
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 220 }}
            />
            <Select
              aria-label="筛选订单状态"
              value={status}
              style={{ width: 140 }}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={[
                { value: '', label: '全部状态' },
                ...Object.entries(states).map(([value, label]) => ({ value, label })),
              ]}
            />
          </Space>
        }
      >
        {orders.isError && (
          <Alert
            type="error"
            title="订单加载失败"
            description={String(orders.error)}
            action={<Button onClick={() => void orders.refetch()}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        {screens.md ? (
          <Table<Order>
            rowKey="id"
            dataSource={filteredItems}
            loading={orders.isLoading}
            scroll={{ x: admin ? 1000 : 800 }}
            locale={{ emptyText: <Empty description={search ? '未找到匹配的订单' : '暂无订单'} /> }}
            pagination={{
              current: page,
              pageSize: 50,
              total: orders.data?.total || 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '订单号',
                render: (_, row) => (
                  <Space>
                    <Button
                      type="link"
                      style={{ padding: 0, fontWeight: 600 }}
                      onClick={() => setSelected(row)}
                    >
                      {row.id.slice(0, 8)}
                    </Button>
                    <Tooltip title="复制完整订单号">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => navigator.clipboard.writeText(row.id)}
                      />
                    </Tooltip>
                  </Space>
                ),
              },
              ...(admin ? [{ title: '用户 ID', dataIndex: 'userId' }] : []),
              {
                title: '套餐名称',
                dataIndex: 'planName',
                render: (val: string) => <Typography.Text strong>{val}</Typography.Text>,
              },
              { title: '周期', render: (_, row) => periodName(row.period) },
              {
                title: '类型',
                render: (_, row) => (
                  <Tag bordered={false} color={row.kind === 'renewal' ? 'cyan' : 'blue'}>
                    {row.kind === 'renewal' ? '续期' : '购买 / 更换套餐'}
                  </Tag>
                ),
              },
              {
                title: '金额',
                render: (_, row) => (
                  <Typography.Text strong style={{ color: 'var(--ant-color-primary)' }}>
                    {money(row.amount)}
                  </Typography.Text>
                ),
              },
              {
                title: '状态',
                render: (_, row) => getStatusTag(row.status),
              },
              { title: '创建时间', render: (_, row) => date(row.createdAt) },
              {
                title: '操作',
                render: (_, row) => (
                  <Space>
                    {row.status === 'pending' && (
                      <Popconfirm title="取消这个订单？" onConfirm={() => act(row, 'cancel')}>
                        <Button disabled={busy}>取消</Button>
                      </Popconfirm>
                    )}
                    {admin && ['pending', 'paid', 'failed'].includes(row.status) && (
                      <Button
                        type="primary"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(row);
                          setNote(row.paymentNote);
                          setError('');
                        }}
                      >
                        {row.status === 'pending' ? '确认收款并开通' : '重试开通'}
                      </Button>
                    )}
                    <Button type="link" onClick={() => setSelected(row)}>
                      详情
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        ) : (
          <List<Order>
            loading={orders.isLoading}
            dataSource={filteredItems}
            locale={{ emptyText: <Empty description={search ? '未找到匹配的订单' : '暂无订单'} /> }}
            pagination={{
              current: page,
              pageSize: 50,
              total: orders.data?.total || 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            renderItem={(row) => (
              <List.Item>
                <div className="order-mobile-card" style={{ width: '100%' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Typography.Text strong style={{ fontSize: 16 }}>
                      {row.planName}
                    </Typography.Text>
                    {getStatusTag(row.status)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: 'var(--ant-color-text-secondary)',
                    }}
                  >
                    <span>
                      {periodName(row.period)} · {row.kind === 'renewal' ? '续期' : '购买'}
                    </span>
                    <strong style={{ color: 'var(--ant-color-primary)', fontSize: 16 }}>
                      {money(row.amount)}
                    </strong>
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    订单号：{row.id.slice(0, 12)}...
                    {admin ? ` · 用户 ID: ${row.userId}` : ''} · {date(row.createdAt)}
                  </Typography.Text>
                  <Space wrap style={{ marginTop: 8 }}>
                    <Button onClick={() => setSelected(row)}>查看详情</Button>
                    {row.status === 'pending' && (
                      <Popconfirm title="取消这个订单？" onConfirm={() => act(row, 'cancel')}>
                        <Button disabled={busy}>取消订单</Button>
                      </Popconfirm>
                    )}
                    {admin && ['pending', 'paid', 'failed'].includes(row.status) && (
                      <Button
                        type="primary"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(row);
                          setNote(row.paymentNote);
                          setError('');
                        }}
                      >
                        {row.status === 'pending' ? '确认收款并开通' : '重试开通'}
                      </Button>
                    )}
                  </Space>
                </div>
              </List.Item>
            )}
          />
        )}
      </Card>

      <Modal
        title="订单详情"
        open={!!selected}
        onCancel={() => setSelected(undefined)}
        footer={<Button onClick={() => setSelected(undefined)}>关闭</Button>}
      >
        {selected && (
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              {
                key: 'id',
                label: '订单号',
                children: <Typography.Text copyable>{selected.id}</Typography.Text>,
              },
              { key: 'plan', label: '套餐名称', children: selected.planName },
              { key: 'period', label: '结算周期', children: periodName(selected.period) },
              {
                key: 'amount',
                label: '支付金额',
                children: (
                  <Typography.Text strong style={{ color: 'var(--ant-color-primary)' }}>
                    {money(selected.amount)} {selected.currency}
                  </Typography.Text>
                ),
              },
              {
                key: 'status',
                label: '当前状态',
                children: getStatusTag(selected.status),
              },
              { key: 'created', label: '创建时间', children: date(selected.createdAt) },
              { key: 'expires', label: '付款截止', children: date(selected.expiresAt) },
              { key: 'paid', label: '确认收款', children: date(selected.paidAt) },
              { key: 'done', label: '开通时间', children: date(selected.completedAt) },
              {
                key: 'target',
                label: '开通后有效期',
                children: selected.paidAt
                  ? selected.targetExpiry
                    ? date(selected.targetExpiry)
                    : '长期有效'
                  : '收款确认时计算',
              },
              ...(admin
                ? [{ key: 'note', label: '收款备注', children: selected.paymentNote || '—' }]
                : []),
            ]}
          />
        )}
      </Modal>

      <Modal
        title={confirming?.status === 'pending' ? '确认收款并开通服务' : '重试服务开通'}
        open={!!confirming}
        onCancel={() => !busy && setConfirming(undefined)}
        onOk={() => confirming && void act(confirming, 'confirm')}
        confirmLoading={busy}
        okButtonProps={{ disabled: !note.trim() }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
      >
        {confirming && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Typography.Paragraph strong style={{ fontSize: 15 }}>
              {confirming.planName} · {periodName(confirming.period)} · {money(confirming.amount)}
            </Typography.Paragraph>
            <Alert
              type="warning"
              showIcon
              title={
                confirming.status === 'pending'
                  ? '确认前请核实款项已到账'
                  : '此次重试不会再次收款或重复延期'
              }
            />
            <div>
              <label
                htmlFor="payment-note"
                style={{ fontWeight: 500, display: 'block', marginBottom: 6 }}
              >
                收款凭证 / 确认备注
              </label>
              <Input.TextArea
                id="payment-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                disabled={busy}
                placeholder="例如：微信转账尾号1234，流水单号..."
              />
            </div>
            {error && <Alert type="error" title={error} showIcon />}
          </Space>
        )}
      </Modal>
    </div>
  );
}
