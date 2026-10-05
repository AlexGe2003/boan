import { useState, useMemo } from 'react';
import { FormProvider } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ClusterOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { FormField, useZodForm } from '@/components/form/rhf';
import { GroupFormSchema, type GroupValues, type NodeGroup } from '@/schemas/commerce';
import { businessPost, useInboundOptions, useNodeGroups } from './api';

const defaults: GroupValues = { name: '', description: '', inboundIds: [] };

export default function NodeGroups() {
  const groups = useNodeGroups();
  const inbounds = useInboundOptions();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<NodeGroup | null | undefined>();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number>();
  const [toast, context] = message.useMessage();
  const form = useZodForm(GroupFormSchema, { defaultValues: defaults });
  const busy = form.formState.isSubmitting;

  const filteredGroups = useMemo(() => {
    const list = groups.data ?? [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(term) ||
        (g.description && g.description.toLowerCase().includes(term))
    );
  }, [groups.data, search]);

  const stats = useMemo(() => {
    const list = groups.data ?? [];
    const totalGroups = list.length;
    const totalInbounds = list.reduce((acc, g) => acc + (g.inboundIds?.length || 0), 0);
    const totalPlans = list.reduce((acc, g) => acc + (g.planCount || 0), 0);
    return { totalGroups, totalInbounds, totalPlans };
  }, [groups.data]);

  function open(row: NodeGroup | null) {
    form.reset(row || defaults);
    setError('');
    setEditing(row);
  }

  async function save(values: GroupValues) {
    setError('');
    try {
      await businessPost('node-groups/save', { ...values, id: editing?.id || 0 });
      setEditing(undefined);
      await Promise.all([groups.refetch(), cache.invalidateQueries({ queryKey: ['store-plans'] })]);
      toast.success('分组已保存；已有用户需要在用户管理同步套餐');
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(id: number) {
    setDeleting(id);
    try {
      await businessPost('node-groups/delete', { id });
      await groups.refetch();
      toast.success('分组已删除');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeleting(undefined);
    }
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {context}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            节点分组
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            把不同服务器的入站组织成独立资源组，由套餐引用。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={groups.isFetching}
            onClick={() => void groups.refetch()}
          >
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>
            创建分组
          </Button>
        </Space>
      </div>

      <div className="orders-stats-grid">
        <div className="orders-stat-card">
          <span className="orders-stat-label">总资源组</span>
          <span className="orders-stat-value">{stats.totalGroups}</span>
        </div>
        <div className="orders-stat-card">
          <span className="orders-stat-label">关联入站总数</span>
          <span className="orders-stat-value" style={{ color: 'var(--ant-color-primary)' }}>
            {stats.totalInbounds}
          </span>
        </div>
        <div className="orders-stat-card">
          <span className="orders-stat-label">引用套餐总数</span>
          <span className="orders-stat-value" style={{ color: '#52c41a' }}>
            {stats.totalPlans}
          </span>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        title="分组变更后需同步已有用户"
        description="保存只更新分组配置。到用户管理重新分配同套餐后，新增节点和旧节点权限才会完成同步。待处理订单保留下单时的节点快照。"
      />

      <Card
        title="资源组列表"
        extra={
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />}
            placeholder="搜索分组名称或说明..."
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
        }
      >
        {groups.isError && (
          <Alert
            type="error"
            title={String(groups.error)}
            action={<Button onClick={() => void groups.refetch()}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        <Table<NodeGroup>
          rowKey="id"
          loading={groups.isLoading}
          dataSource={filteredGroups}
          scroll={{ x: 650 }}
          columns={[
            {
              title: '分组名称',
              dataIndex: 'name',
              render: (name: string) => (
                <Space>
                  <ClusterOutlined style={{ color: 'var(--ant-color-primary)' }} />
                  <Typography.Text strong>{name}</Typography.Text>
                </Space>
              ),
            },
            {
              title: '说明',
              dataIndex: 'description',
              render: (desc: string) => desc || <span style={{ color: 'var(--ant-color-text-tertiary)' }}>—</span>,
            },
            {
              title: '节点入站',
              render: (_, row) => (
                <Tag color="geekblue" style={{ borderRadius: 6 }}>
                  {row.inboundIds.length} 个入站
                </Tag>
              ),
            },
            {
              title: '引用套餐',
              dataIndex: 'planCount',
              render: (count: number) => (
                <Tag color={count > 0 ? 'green' : 'default'} style={{ borderRadius: 6 }}>
                  {count} 个套餐
                </Tag>
              ),
            },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button type="link" icon={<EditOutlined />} onClick={() => open(row)}>
                    编辑
                  </Button>
                  <Popconfirm title="删除分组？" onConfirm={() => remove(row.id)}>
                    <Button
                      type="link"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={row.planCount > 0 || deleting !== undefined}
                      loading={deleting === row.id}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing ? '编辑节点分组' : '创建节点分组'}
        open={editing !== undefined}
        onOk={() => void form.handleSubmit(save)()}
        onCancel={() => !busy && setEditing(undefined)}
        confirmLoading={busy}
        okButtonProps={{ disabled: inbounds.isLoading || inbounds.isError }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        destroyOnHidden
      >
        {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
        {inbounds.isError && (
          <Alert
            type="error"
            title="节点入站加载失败"
            action={<Button onClick={() => void inbounds.refetch()}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        <FormProvider {...form}>
          <Form layout="vertical" disabled={busy}>
            <FormField name="name" label="分组名称" required>
              <Input maxLength={40} placeholder="例如：亚太高速专线组" />
            </FormField>
            <FormField name="description" label="说明">
              <Input.TextArea rows={2} maxLength={1000} placeholder="分组说明备注..." />
            </FormField>
            <FormField name="inboundIds" label="节点入站" required>
              <Select
                mode="multiple"
                placeholder="请选择此资源组包含的入站节点..."
                optionFilterProp="label"
                options={inbounds.data?.map((ib) => ({
                  value: ib.id,
                  label: `${ib.remark || ib.tag || `入站 ${ib.id}`} · ${ib.protocol} · ${ib.nodeId ? `节点 ${ib.nodeId}` : '本机'}`,
                }))}
              />
            </FormField>
          </Form>
        </FormProvider>
      </Modal>
    </Space>
  );
}
