import zhCN from 'antd/locale/zh_CN';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import AppSidebar from '@/layouts/AppSidebar';
import { useTheme } from '@/hooks/useTheme';
import { HttpUtil } from '@/utils';
import { useSubscriptionPlans, postPlan, type SubscriptionPlan } from './api';
import type { InboundOption } from '@/hooks/useClients';

type Values = Omit<SubscriptionPlan, 'totalGB'> & { quotaGB: number };
export default function PlansPage() {
  const { antdThemeConfig } = useTheme();
  const plans = useSubscriptionPlans();
  const [editing, setEditing] = useState<SubscriptionPlan | null | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm<Values>();
  const [toast, context] = message.useMessage();
  const inbounds = useQuery({
    queryKey: ['plan-inbound-options'],
    queryFn: async () => {
      const result = await HttpUtil.get<InboundOption[]>('/panel/api/inbounds/options', undefined, {
        silent: true,
      });
      if (!result.success) throw new Error(result.msg);
      return result.obj || [];
    },
  });
  function open(plan: SubscriptionPlan | null) {
    setEditing(plan);
    setError('');
    form.resetFields();
    form.setFieldsValue(
      plan
        ? { ...plan, quotaGB: plan.totalGB / 1073741824 }
        : {
            name: '',
            description: '',
            quotaGB: 100,
            durationDays: 30,
            limitIp: 0,
            limitHwid: 0,
            enabled: true,
            inboundIds: [],
          },
    );
  }
  async function save(v: Values) {
    setSaving(true);
    setError('');
    try {
      const result = await postPlan('save', {
        ...v,
        id: editing?.id || 0,
        totalGB: Math.round(v.quotaGB * 1073741824),
      });
      if (!result.success) {
        setError(result.msg);
        return;
      }
      setEditing(undefined);
      await plans.refetch();
      toast.success('套餐已保存');
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: number) {
    const result = await postPlan('delete', { id });
    if (result.success) {
      await plans.refetch();
      toast.success('套餐已删除');
    } else toast.error(result.msg);
  }
  return (
    <ConfigProvider theme={antdThemeConfig} locale={zhCN}>
      {context}
      <Layout className="settings-page">
        <AppSidebar />
        <Layout className="content-shell">
          <Layout.Content className="content-area" style={{ padding: 24, minWidth: 0 }}>
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Typography.Title level={2}>订阅套餐</Typography.Title>
                <Typography.Paragraph type="secondary">
                  把一组节点入站、流量额度和使用限制保存为套餐，在用户管理中统一分配。
                </Typography.Paragraph>
              </div>
              <Alert
                type="info"
                title="每位用户独立统计用量，拥有独立订阅链接"
                description="编辑套餐不会立即修改已有用户。在用户管理中勾选用户后点击“分配套餐”可批量同步。同套餐同步保留到期时间；更换套餐从分配日计算有效期，已用流量不会清零。"
              />
              <Card
                title="套餐列表"
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>
                    创建套餐
                  </Button>
                }
              >
                {plans.isError && <Alert type="error" title={String(plans.error)} />}
                <Table<SubscriptionPlan>
                  rowKey="id"
                  loading={plans.isLoading}
                  dataSource={plans.data}
                  scroll={{ x: 850 }}
                  columns={[
                    {
                      title: '套餐名称',
                      dataIndex: 'name',
                      render: (name, row) => (
                        <div>
                          <strong>{name}</strong>
                          <div style={{ color: 'var(--ant-color-text-secondary)' }}>
                            {row.description}
                          </div>
                        </div>
                      ),
                    },
                    { title: '节点入站', render: (_, row) => `${row.inboundIds.length} 个` },
                    {
                      title: '流量额度',
                      render: (_, row) =>
                        row.totalGB ? `${row.totalGB / 1073741824} GB` : '不限量',
                    },
                    {
                      title: '有效期',
                      render: (_, row) => (row.durationDays ? `${row.durationDays} 天` : '长期'),
                    },
                    {
                      title: '状态',
                      render: (_, row) => (
                        <Tag color={row.enabled ? 'green' : 'default'}>
                          {row.enabled ? '可分配' : '已停用'}
                        </Tag>
                      ),
                    },
                    {
                      title: '操作',
                      render: (_, row) => (
                        <Space>
                          <Button type="link" onClick={() => open(row)}>
                            编辑
                          </Button>
                          <Popconfirm
                            title="删除这个套餐？"
                            description="仍有用户使用的套餐不能删除，可改为停用。"
                            onConfirm={() => remove(row.id)}
                          >
                            <Button type="link" danger>
                              删除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            </Space>
          </Layout.Content>
        </Layout>
      </Layout>
      <Modal
        title={editing ? '编辑套餐' : '创建套餐'}
        open={editing !== undefined}
        onCancel={() => !saving && setEditing(undefined)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okButtonProps={{ disabled: inbounds.isLoading || inbounds.isError }}
        destroyOnHidden
      >
        {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
        {inbounds.isError && (
          <Alert
            type="error"
            title="节点列表加载失败"
            action={<Button onClick={() => void inbounds.refetch()}>重试</Button>}
          />
        )}
        <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
          <Form.Item name="name" label="套餐名称" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={60} placeholder="例如：亚洲标准套餐" />
          </Form.Item>
          <Form.Item name="description" label="套餐说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="inboundIds"
            label="节点分组（选择套餐包含的节点入站）"
            rules={[{ required: true, type: 'array', min: 1 }]}
            extra="节点以可连接的入站为单位；可同时选择多个服务器上的入站。"
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              loading={inbounds.isLoading}
              options={inbounds.data?.map((ib) => ({
                value: ib.id,
                label: `${ib.remark || ib.tag || `入站 ${ib.id}`} · ${ib.protocol} · ${ib.nodeId ? `节点 ${ib.nodeId}` : '本机'}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="quotaGB"
            label="每用户流量额度（GB，0 为不限量）"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={1000000} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="durationDays" label="有效天数（0 为长期）" rules={[{ required: true }]}>
            <InputNumber min={0} max={36500} precision={0} />
          </Form.Item>
          <Form.Item name="limitIp" label="IP 数量限制（0 为不限，需服务端启用对应限制功能）">
            <InputNumber min={0} precision={0} />
          </Form.Item>
          <Form.Item name="limitHwid" label="设备数量限制（0 为不限，需客户端支持 HWID）">
            <InputNumber min={0} precision={0} />
          </Form.Item>
          <Form.Item name="enabled" label="允许分配" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </ConfigProvider>
  );
}
