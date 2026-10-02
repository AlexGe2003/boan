import { useState } from 'react';
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
  Typography,
  message,
} from 'antd';
import { FormField, useZodForm } from '@/components/form/rhf';
import { GroupFormSchema, type GroupValues, type NodeGroup } from '@/schemas/commerce';
import { businessPost, useInboundOptions, useNodeGroups } from './api';
const defaults: GroupValues = { name: '', description: '', inboundIds: [] };
export default function NodeGroups() {
  const groups = useNodeGroups();
  const inbounds = useInboundOptions();
  const cache = useQueryClient();
  const [editing, setEditing] = useState<NodeGroup | null | undefined>();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number>();
  const [toast, context] = message.useMessage();
  const form = useZodForm(GroupFormSchema, { defaultValues: defaults });
  const busy = form.formState.isSubmitting;
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
      <div>
        <Typography.Title level={2}>节点分组</Typography.Title>
        <Typography.Paragraph type="secondary">
          把不同服务器的入站组织成独立资源组，由套餐引用。
        </Typography.Paragraph>
      </div>
      <Alert
        type="info"
        title="分组变更后需同步已有用户"
        description="保存只更新分组配置。到用户管理重新分配同套餐后，新增节点和旧节点权限才会完成同步。待处理订单保留下单时的节点快照。"
      />
      <Card
        title="资源组"
        extra={
          <Button type="primary" onClick={() => open(null)}>
            创建分组
          </Button>
        }
      >
        {groups.isError && (
          <Alert
            type="error"
            title={String(groups.error)}
            action={<Button onClick={() => void groups.refetch()}>重试</Button>}
          />
        )}
        <Table<NodeGroup>
          rowKey="id"
          loading={groups.isLoading}
          dataSource={groups.data}
          scroll={{ x: 650 }}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '说明', dataIndex: 'description' },
            { title: '节点入站', render: (_, row) => `${row.inboundIds.length} 个` },
            { title: '引用套餐', dataIndex: 'planCount' },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button type="link" onClick={() => open(row)}>
                    编辑
                  </Button>
                  <Popconfirm title="删除分组？" onConfirm={() => remove(row.id)}>
                    <Button
                      type="link"
                      danger
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
        {error && <Alert type="error" title={error} />}
        {inbounds.isError && (
          <Alert
            type="error"
            title="节点入站加载失败"
            action={<Button onClick={() => void inbounds.refetch()}>重试</Button>}
          />
        )}
        <FormProvider {...form}>
          <Form layout="vertical" disabled={busy}>
            <FormField name="name" label="分组名称" required>
              <Input maxLength={40} />
            </FormField>
            <FormField name="description" label="说明">
              <Input.TextArea rows={2} maxLength={1000} />
            </FormField>
            <FormField name="inboundIds" label="节点入站" required>
              <Select
                mode="multiple"
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
