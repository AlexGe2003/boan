import { useState } from 'react';
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
  Typography,
} from 'antd';
import { money, periodName, type Order } from '@/schemas/commerce';
import { businessPost, useOrders } from './api';
const states = {
  pending: '待付款确认',
  paid: '已收款待开通',
  failed: '开通失败',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已过期',
};
const colors = {
  pending: 'gold',
  paid: 'blue',
  failed: 'red',
  completed: 'green',
  cancelled: 'default',
  expired: 'default',
};
function date(value: number) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}
export default function Orders({ admin = false }: { admin?: boolean }) {
  const cache = useQueryClient();
  const screens = Grid.useBreakpoint();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const orders = useOrders(page, status);
  const [selected, setSelected] = useState<Order>();
  const [confirming, setConfirming] = useState<Order>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={admin ? 2 : 3}>{admin ? '订单管理' : '我的订单'}</Typography.Title>
      <Alert
        type="info"
        title="线下收款由管理员核实后开通"
        description="同套餐续期从当前到期时间（已到期则从确认日）延长；换套餐从确认日计算。当前购买与续期保留已用流量，不自动清零。待确认订单 30 分钟过期。"
      />
      {error && !confirming && (
        <Alert type="error" title={error} closable onClose={() => setError('')} />
      )}
      <Card
        title="订单列表"
        extra={
          <Select
            aria-label="筛选订单状态"
            value={status}
            style={{ width: 150 }}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: '', label: '全部状态' },
              ...Object.entries(states).map(([value, label]) => ({ value, label })),
            ]}
          />
        }
      >
        {orders.isError && (
          <Alert
            type="error"
            title="订单加载失败"
            description={String(orders.error)}
            action={<Button onClick={() => void orders.refetch()}>重试</Button>}
          />
        )}
        {screens.md ? (
          <Table<Order>
            rowKey="id"
            dataSource={orders.data?.items}
            loading={orders.isLoading}
            scroll={{ x: admin ? 1000 : 800 }}
            locale={{ emptyText: <Empty description="暂无订单" /> }}
            pagination={{
              current: page,
              pageSize: 50,
              total: orders.data?.total || 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '订单',
                render: (_, row) => (
                  <Button type="link" onClick={() => setSelected(row)}>
                    {row.id.slice(0, 8)}
                  </Button>
                ),
              },
              ...(admin ? [{ title: '用户 ID', dataIndex: 'userId' }] : []),
              { title: '套餐', dataIndex: 'planName' },
              { title: '周期', render: (_, row) => periodName(row.period) },
              {
                title: '类型',
                render: (_, row) => (row.kind === 'renewal' ? '续期' : '购买 / 更换套餐'),
              },
              { title: '金额', render: (_, row) => money(row.amount) },
              {
                title: '状态',
                render: (_, row) => <Tag color={colors[row.status]}>{states[row.status]}</Tag>,
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
            dataSource={orders.data?.items}
            locale={{ emptyText: <Empty description="暂无订单" /> }}
            pagination={{
              current: page,
              pageSize: 50,
              total: orders.data?.total || 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            renderItem={(row) => (
              <List.Item>
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <Space wrap>
                    <Typography.Text strong>{row.planName}</Typography.Text>
                    <Tag color={colors[row.status]}>{states[row.status]}</Tag>
                  </Space>
                  <Typography.Text>
                    {periodName(row.period)} · {money(row.amount)} ·{' '}
                    {row.kind === 'renewal' ? '续期' : '购买 / 更换套餐'}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {date(row.createdAt)}
                    {admin ? ` · 用户 ${row.userId}` : ''}
                  </Typography.Text>
                  <Space wrap>
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
                </Space>
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
          <>
            <Descriptions
              column={1}
              items={[
                {
                  key: 'id',
                  label: '订单号',
                  children: <Typography.Text copyable>{selected.id}</Typography.Text>,
                },
                { key: 'plan', label: '套餐', children: selected.planName },
                { key: 'period', label: '周期', children: periodName(selected.period) },
                {
                  key: 'amount',
                  label: '金额',
                  children: `${money(selected.amount)} ${selected.currency}`,
                },
                { key: 'status', label: '状态', children: states[selected.status] },
                { key: 'created', label: '创建', children: date(selected.createdAt) },
                { key: 'expires', label: '付款确认截止', children: date(selected.expiresAt) },
                { key: 'paid', label: '确认收款', children: date(selected.paidAt) },
                { key: 'done', label: '开通完成', children: date(selected.completedAt) },
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
            {selected.lastError && (
              <Alert
                type="error"
                title="开通失败"
                description={admin ? selected.lastError : '请通过工单联系管理员处理。'}
              />
            )}
          </>
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
          <>
            <Typography.Paragraph>
              {confirming.planName} · {periodName(confirming.period)} · {money(confirming.amount)}
            </Typography.Paragraph>
            <Alert
              type="warning"
              title={
                confirming.status === 'pending'
                  ? '确认前请核实款项已到账'
                  : '此次重试不会再次收款或重复延期'
              }
            />
            <label htmlFor="payment-note">收款凭证 / 确认备注</label>
            <Input.TextArea
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              disabled={busy}
              style={{ marginTop: 8 }}
            />
            {error && <Alert type="error" title={error} style={{ marginTop: 12 }} />}
          </>
        )}
      </Modal>
    </Space>
  );
}
