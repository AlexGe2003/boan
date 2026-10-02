import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Select, Space, Spin, Typography } from 'antd';
import './business.css';
import { money, periodName, type StorePlan } from '@/schemas/commerce';
import { businessPost, useStorePlans } from './api';
function StoreCard({
  plan,
  busy,
  onBuy,
}: {
  plan: StorePlan;
  busy: boolean;
  onBuy: (plan: StorePlan, period: string) => void;
}) {
  const [period, setPeriod] = useState(plan.prices[0]?.period);
  const price = plan.prices.find((p) => p.period === period) || plan.prices[0];
  return (
    <Card title={plan.name} className="store-plan">
      <div className="store-price">
        {price ? money(price.amount) : '—'}
        <Typography.Text type="secondary">
          {' '}
          / {price ? periodName(price.period) : '暂无定价'}
        </Typography.Text>
      </div>
      <Typography.Paragraph>{plan.description}</Typography.Paragraph>
      <Typography.Paragraph>
        {plan.totalGB ? `${plan.totalGB / 1073741824} GB` : '不限量'} · {plan.nodeCount} 个节点
        {plan.limitHwid > 0 ? ` · ${plan.limitHwid} 台设备` : ''}
      </Typography.Paragraph>
      <Space wrap>
        <Select
          aria-label={`${plan.name}购买周期`}
          value={price?.period}
          style={{ minWidth: 180 }}
          onChange={setPeriod}
          options={plan.prices.map((p) => ({
            value: p.period,
            label: `${periodName(p.period)} · ${money(p.amount)}`,
          }))}
        />
        <Button
          type="primary"
          disabled={busy || !price}
          onClick={() => price && onBuy(plan, price.period)}
        >
          创建购买 / 续期订单
        </Button>
      </Space>
    </Card>
  );
}
export default function Store({ onOrdered }: { onOrdered: () => void }) {
  const plans = useStorePlans();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function buy(plan: StorePlan, period: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await businessPost('commerce/orders', { planId: plan.id, period });
      await cache.invalidateQueries({ queryKey: ['commerce-orders'] });
      onOrdered();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3}>购买套餐</Typography.Title>
      <Alert
        type="info"
        title="创建订单后联系管理员确认付款"
        description="当前采用线下付款确认。请通过工单沟通付款方式并提供订单号，管理员核实后开通。购买同套餐会续期；购买其他套餐会更换服务。购买与续期均保留已用流量。"
      />
      {error && <Alert type="error" title={error} />}
      {plans.isLoading && <Spin />}
      {plans.isError && (
        <Alert
          type="error"
          title="套餐加载失败"
          description={String(plans.error)}
          action={<Button onClick={() => void plans.refetch()}>重试</Button>}
        />
      )}
      {plans.isSuccess && plans.data.length === 0 && (
        <Empty description="暂无可购买套餐，管理员仍可手动分配服务。" />
      )}
      <div className="store-grid">
        {plans.data?.map((plan) => (
          <StoreCard
            key={plan.id}
            plan={plan}
            busy={busy}
            onBuy={(p, period) => void buy(p, period)}
          />
        ))}
      </div>
    </Space>
  );
}
