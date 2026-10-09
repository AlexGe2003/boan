import { useHostsQuery } from '@/api/queries/useHostsQuery';
import zhCN from 'antd/locale/zh_CN';
import { useState } from 'react';
import { FormProvider, useFieldArray } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Form,
  Empty,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SearchOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router';
import '@/pages/business/business.css';
import './PlansPage.css';
import AppSidebar from '@/layouts/AppSidebar';
import { useTheme } from '@/hooks/useTheme';
import { FormField, useZodForm } from '@/components/form/rhf';
import {
  PlanFormSchema,
  PriceSchema,
  money,
  periodDays,
  periodLabels,
  periodName,
  type PlanValues,
} from '@/schemas/commerce';
import { useNodeGroups, useInboundOptions } from '@/pages/business/api';
import { useSubscriptionPlans, postPlan, type SubscriptionPlan } from './api';

const defaults: PlanValues = {
  name: '',
  description: '',
  inboundIds: [],
  nodeGroupIds: [],
  quotaGB: 100,
  durationDays: 30,
  limitIp: 0,
  limitHwid: 3,
  enabled: true,
  prices: [],
};
export default function PlansPage() {
  const { antdThemeConfig, isDark, isUltra } = useTheme();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const plans = useSubscriptionPlans();
  const visiblePlans = (plans.data || []).filter(
    (plan) =>
      (status === 'all' || plan.enabled === (status === 'enabled')) &&
      `${plan.name} ${plan.description}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const groups = useNodeGroups();
  const inbounds = useInboundOptions();
  const hostQuery = useHostsQuery();
  function lineNames(id: number) {
    const inbound = inbounds.data?.find((item) => item.id === id);
    const name = inbound?.remark || inbound?.tag || `入站 ${id}`;
    const hosts = hostQuery.hosts
      .filter((host) => host.inboundIds.includes(id) && !host.isDisabled && !host.isHidden)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return hosts.length
      ? hosts.map((host) => `${name} · ${host.remark || host.hosts.join(' / ')}`)
      : [name];
  }
  function planLines(plan: SubscriptionPlan) {
    const ids = new Set([
      ...plan.inboundIds,
      ...(groups.data || [])
        .filter((group) => plan.nodeGroupIds.includes(group.id))
        .flatMap((group) => group.inboundIds),
    ]);
    return [...ids].flatMap(lineNames);
  }
  const [editing, setEditing] = useState<SubscriptionPlan | null | undefined>();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number>();
  const [toast, context] = message.useMessage();
  const form = useZodForm(PlanFormSchema, { defaultValues: defaults });
  const prices = useFieldArray({ control: form.control, name: 'prices' });
  const saving = form.formState.isSubmitting;
  function open(plan: SubscriptionPlan | null) {
    setError('');
    form.reset(plan ? { ...plan, quotaGB: plan.totalGB / 1073741824 } : defaults);
    setEditing(plan);
  }
  async function save(values: PlanValues) {
    setError('');
    try {
      const result = await postPlan('save', {
        ...values,
        id: editing?.id || 0,
        totalGB: Math.round(values.quotaGB * 1073741824),
      });
      if (!result.success) throw new Error(result.msg);
      setEditing(undefined);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['subscription-plans'] }),
        cache.invalidateQueries({ queryKey: ['node-groups'] }),
        cache.invalidateQueries({ queryKey: ['store-plans'] }),
      ]);
      toast.success('套餐已保存');
    } catch (e) {
      setError(String(e));
    }
  }
  async function remove(id: number) {
    setDeleting(id);
    try {
      const result = await postPlan('delete', { id });
      if (!result.success) throw new Error(result.msg);
      await Promise.all([
        plans.refetch(),
        cache.invalidateQueries({ queryKey: ['node-groups'] }),
        cache.invalidateQueries({ queryKey: ['store-plans'] }),
      ]);
      toast.success('套餐已删除');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeleting(undefined);
    }
  }
  return (
    <ConfigProvider theme={antdThemeConfig} locale={zhCN}>
      {context}
      <Layout
        className={`settings-page business-page${isDark ? ' is-dark' : ''}${isUltra ? ' is-ultra' : ''}`}
      >
        <AppSidebar />
        <Layout className="content-shell">
          <Layout.Content className="content-area plans-content">
            <div className="plans-heading">
              <div>
                <span className="plans-eyebrow">服务管理</span>
                <Typography.Title level={2}>节点套餐</Typography.Title>
                <Typography.Paragraph type="secondary">
                  把节点组合成套餐，设置流量与有效期，再到用户管理中分配给已创建的账号。
                </Typography.Paragraph>
              </div>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>
                创建套餐
              </Button>
            </div>
            <div className="plans-summary" aria-label="套餐概况">
              {[
                ['全部套餐', plans.data?.length],
                ['已启用', plans.data?.filter((p) => p.enabled).length],
                ['可购买', plans.data?.filter((p) => p.enabled && p.prices.length > 0).length],
                ['节点分组', groups.data?.length],
              ].map(([label, count]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{count ?? '—'}</strong>
                </div>
              ))}
            </div>
            <div className="plans-toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索套餐名称或说明"
                aria-label="搜索套餐"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                aria-label="套餐状态"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: '全部状态' },
                  { value: 'enabled', label: '已启用' },
                  { value: 'disabled', label: '已停用' },
                ]}
              />
              <Typography.Text type="secondary">
                {plans.data
                  ? `${visiblePlans.length} 个套餐`
                  : plans.isLoading
                    ? '正在加载'
                    : '未加载'}
              </Typography.Text>
            </div>
            {plans.isError && (
              <Alert
                type="error"
                title="套餐加载失败"
                description={String(plans.error)}
                action={<Button onClick={() => void plans.refetch()}>重试</Button>}
              />
            )}
            {plans.isLoading ? (
              <div className="plans-grid">
                {[0, 1, 2].map((key) => (
                  <Card key={key} loading />
                ))}
              </div>
            ) : (
              <div className="plans-grid">
                {visiblePlans.map((row) => (
                  <Card
                    key={row.id}
                    className={`admin-plan-card${row.enabled ? '' : ' is-disabled'}`}
                  >
                    <div className="admin-plan-title">
                      <Typography.Title level={3}>{row.name}</Typography.Title>
                      <Tag color={row.enabled ? 'green' : 'default'}>
                        {row.enabled ? '已启用' : '已停用'}
                      </Tag>
                    </div>
                    <Typography.Paragraph
                      className="admin-plan-description"
                      type="secondary"
                      ellipsis={{ rows: 2, tooltip: row.description }}
                    >
                      {row.description || '未添加套餐说明'}
                    </Typography.Paragraph>
                    <div className="admin-plan-quota">
                      <strong>{row.totalGB ? row.totalGB / 1073741824 : '不限量'}</strong>
                      {!!row.totalGB && <span>GB / 用户</span>}
                    </div>
                    <dl className="admin-plan-specs">
                      <div>
                        <dt>分配时长</dt>
                        <dd>{row.durationDays ? `${row.durationDays} 天` : '长期'}</dd>
                      </div>
                      <div>
                        <dt>连接限制</dt>
                        <dd>
                          {row.limitIp ? `${row.limitIp} IP` : 'IP 不限'} ·{' '}
                          {row.limitHwid ? `${row.limitHwid} 台设备` : '设备不限'}
                        </dd>
                      </div>
                      <div>
                        <dt>节点资源</dt>
                        <dd>
                          {row.nodeGroupIds.length} 分组
                          {row.inboundIds.length > 0 ? ` · ${row.inboundIds.length} 直接入站` : ''}
                        </dd>
                      </div>
                    </dl>
                    <div className="admin-plan-lines">
                      <Typography.Text strong>包含线路</Typography.Text>
                      {hostQuery.fetchError || inbounds.isError || groups.isError ? (
                        <Typography.Paragraph type="danger">
                          线路名称加载失败，请刷新重试。
                        </Typography.Paragraph>
                      ) : !hostQuery.fetched || inbounds.isLoading || groups.isLoading ? (
                        <Typography.Paragraph type="secondary">正在加载线路…</Typography.Paragraph>
                      ) : (
                        <ul style={{ paddingInlineStart: 20, marginBlock: 8 }}>
                          {planLines(row).map((name, index) => (
                            <li key={`${index}-${name}`}>{name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="admin-plan-pricing">
                      <span className="admin-plan-section-label">购买周期</span>
                      {row.prices.length ? (
                        <div className="admin-plan-price-list">
                          {row.prices.map((price) => (
                            <div key={price.period}>
                              <span>{periodName(price.period)}</span>
                              <strong>{money(price.amount)}</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Typography.Text type="secondary">仅管理员分配</Typography.Text>
                      )}
                    </div>
                    <div className="admin-plan-actions">
                      <Button icon={<EditOutlined />} onClick={() => open(row)}>
                        编辑套餐
                      </Button>
                      <Popconfirm
                        title="删除这个套餐？"
                        description="仍被用户或待处理订单使用的套餐不能删除。"
                        onConfirm={() => remove(row.id)}
                      >
                        <Button
                          type="text"
                          danger
                          aria-label={`删除${row.name}`}
                          icon={<DeleteOutlined />}
                          loading={deleting === row.id}
                          disabled={deleting !== undefined}
                        />
                      </Popconfirm>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {plans.isSuccess && !visiblePlans.length && (
              <Card>
                <Empty
                  description={
                    plans.data.length
                      ? '没有符合条件的套餐'
                      : '暂无套餐，创建套餐后即可分配给用户。'
                  }
                />
                {plans.data.length > 0 && (
                  <Button
                    onClick={() => {
                      setSearch('');
                      setStatus('all');
                    }}
                  >
                    清除筛选
                  </Button>
                )}
              </Card>
            )}
            <details className="plans-rule-note">
              <summary>
                <InfoCircleOutlined /> 套餐修改与开通规则
              </summary>
              <p>
                编辑套餐不会自动同步到已有用户。在用户管理中重新分配同套餐，可同步节点并保留到期时间、订阅凭据与用量。
              </p>
              <p>
                购买订单保留下单时的价格与节点快照。管理员核实线下收款后开通；续期延长有效期，不重置已用流量。设备限制需要客户端支持
                HWID。
              </p>
            </details>
          </Layout.Content>
        </Layout>
      </Layout>
      <Modal
        title={editing ? '编辑套餐' : '创建套餐'}
        open={editing !== undefined}
        onCancel={() => !saving && setEditing(undefined)}
        onOk={() => void form.handleSubmit(save)()}
        confirmLoading={saving}
        okButtonProps={{
          disabled: inbounds.isLoading || inbounds.isError || groups.isLoading || groups.isError,
        }}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={!saving}
        destroyOnHidden
        width={640}
      >
        {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
        {(inbounds.isError || groups.isError) && (
          <Alert
            type="error"
            title="节点资源加载失败"
            action={
              <Button onClick={() => void Promise.all([inbounds.refetch(), groups.refetch()])}>
                重试
              </Button>
            }
          />
        )}
        <FormProvider {...form}>
          <Form layout="vertical" disabled={saving} className="plan-editor">
            <Typography.Title level={5}>基本信息</Typography.Title>
            <FormField name="name" label="套餐名称" required>
              <Input maxLength={40} />
            </FormField>
            <FormField name="description" label="套餐说明">
              <Input.TextArea rows={2} maxLength={1000} />
            </FormField>
            <Typography.Title level={5}>节点权限</Typography.Title>
            <FormField
              name="nodeGroupIds"
              label="节点分组"
              extra={<Link to="/node-groups">管理独立节点分组</Link>}
            >
              <Select
                mode="multiple"
                optionFilterProp="label"
                options={groups.data?.map((g) => ({
                  value: g.id,
                  label: `${g.name} · ${g.inboundIds.length} 个入站`,
                }))}
              />
            </FormField>
            <FormField
              name="inboundIds"
              label="套餐节点"
              extra="选择此套餐包含的节点；也可选择上方节点分组，两者会合并去重。"
            >
              <Select
                mode="multiple"
                optionFilterProp="label"
                options={inbounds.data?.map((ib) => ({
                  value: ib.id,
                  label: `${lineNames(ib.id).join('；')} · ${ib.protocol}`,
                }))}
              />
            </FormField>
            <Typography.Title level={5}>用量与限制</Typography.Title>
            <FormField name="quotaGB" label="每用户流量额度（GB，0 为不限量）" required>
              <InputNumber min={0} max={1000000} precision={2} style={{ width: '100%' }} />
            </FormField>
            <FormField
              name="durationDays"
              label="管理员分配天数（0 为长期）"
              extra="购买订单按下面所选的价格周期计算有效期。"
            >
              <InputNumber min={0} max={36500} precision={0} />
            </FormField>
            <FormField name="limitIp" label="IP 限制（0 为不限，需启用对应服务端限制）">
              <InputNumber min={0} precision={0} />
            </FormField>
            <FormField
              name="limitHwid"
              label="设备限制（0 为不限，需客户端支持 HWID）"
              extra="达到上限后拒绝新设备；用户或管理员解绑后才可重新绑定。降低上限不会自动删除已有设备。"
            >
              <InputNumber min={0} precision={0} />
            </FormField>
            <FormField name="enabled" label="允许分配与购买" valueProp="checked">
              <Switch />
            </FormField>
            <Typography.Title level={5}>购买价格（人民币）</Typography.Title>
            {form.formState.errors.prices?.message && (
              <Alert type="error" title={form.formState.errors.prices.message} />
            )}
            <Typography.Paragraph type="secondary">
              不添加价格时，仅支持管理员分配。购买需要管理员核实线下收款后确认开通。
            </Typography.Paragraph>
            {prices.fields.map((field, index) => (
              <div key={field.id} className="plan-price-editor">
                <FormField
                  name={`prices.${index}.period`}
                  label="周期"
                  onAfterChange={(value) =>
                    form.setValue(
                      `prices.${index}.days`,
                      periodDays[value as keyof typeof periodDays],
                    )
                  }
                >
                  <Select
                    options={Object.entries(periodLabels).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />
                </FormField>
                <FormField
                  name={`prices.${index}.amount`}
                  label="价格（元）"
                  transform={{
                    input: (v) => (typeof v === 'number' ? v / 100 : null),
                    output: (v) => (typeof v === 'number' ? Math.round(v * 100) : v),
                  }}
                >
                  <InputNumber min={0.01} max={1000000} precision={2} />
                </FormField>
                <Button danger icon={<DeleteOutlined />} onClick={() => prices.remove(index)}>
                  移除周期
                </Button>
              </div>
            ))}
            <Button
              icon={<PlusOutlined />}
              disabled={prices.fields.length >= 7}
              onClick={() => {
                const existing = form.getValues('prices');
                const next = PriceSchema.shape.period.options.find(
                  (key) => !existing.some((p) => p.period === key),
                );
                if (next) prices.append({ period: next, days: periodDays[next], amount: 990 });
              }}
            >
              添加价格周期
            </Button>
          </Form>
        </FormProvider>
      </Modal>
    </ConfigProvider>
  );
}
