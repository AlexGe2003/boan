import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Modal, Select, Table } from 'antd';
import { HttpUtil } from '@/utils';

interface Account {
  id: number;
  username: string;
  role: string;
  inboundCount: number;
}
export default function LegacyAccountMigration({
  users,
  onSaved,
}: {
  users: Account[];
  onSaved: () => Promise<unknown>;
}) {
  const legacy = users.filter((u) => u.role !== 'admin' && u.role !== 'customer');
  const [selected, setSelected] = useState<Account | null>(null);
  const [form] = Form.useForm<{ clientId: number; ownerId?: number }>();
  const targets = useQuery({
    queryKey: ['account-migration-targets'],
    enabled: selected !== null,
    staleTime: 0,
    queryFn: async () => {
      const result = await HttpUtil.get<{ id: number; email: string }[]>(
        '/panel/api/setting/users/migrationTargets',
        undefined,
        { silent: true },
      );
      if (!result.success) throw new Error(result.msg || '无法加载订阅用户');
      return result.obj ?? [];
    },
  });
  const migrate = useMutation({
    mutationFn: async (values: { clientId: number; ownerId?: number }) => {
      if (!selected) return;
      const result = await HttpUtil.post(
        '/panel/api/setting/users/migrate/' + selected.id,
        values,
        { headers: { 'Content-Type': 'application/json' }, silent: true },
      );
      if (!result.success) throw new Error(result.msg || '迁移失败');
    },
    onSuccess: async () => {
      setSelected(null);
      form.resetFields();
      await onSaved();
    },
  });
  if (!legacy.length) return null;
  return (
    <>
      <Alert
        style={{ marginTop: 24, marginBottom: 12 }}
        type="warning"
        showIcon
        title="有旧后台账号待处理"
        description="确认对应的订阅用户后再迁移。账号密码和订阅数据保留，旧登录会话失效；拥有入站的账号需指定接收管理员。"
      />
      <Table
        rowKey="id"
        dataSource={legacy}
        pagination={false}
        scroll={{ x: 480 }}
        columns={[
          { title: '旧账号', dataIndex: 'username' },
          { title: '入站数量', dataIndex: 'inboundCount' },
          {
            title: '操作',
            render: (_, row) => (
              <Button
                onClick={() => {
                  setSelected(row);
                  form.resetFields();
                  migrate.reset();
                }}
              >
                迁移为订阅用户
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={selected !== null}
        title={'迁移账号：' + (selected?.username ?? '')}
        okText="确认迁移"
        cancelText="取消"
        confirmLoading={migrate.isPending}
        onCancel={() => {
          if (!migrate.isPending) setSelected(null);
        }}
        onOk={() => form.submit()}
      >
        {(migrate.isError || targets.isError) && (
          <Alert type="error" title={String(migrate.error || targets.error)} />
        )}
        <Form form={form} layout="vertical" onFinish={(values) => migrate.mutate(values)}>
          <Form.Item
            name="clientId"
            label="对应的订阅用户"
            rules={[{ required: true, message: '请选择对应的订阅用户' }]}
            extra="请选择已有的订阅配置，迁移不会重置流量或订阅地址。"
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={targets.isFetching}
              options={(targets.data ?? []).map((item) => ({ value: item.id, label: item.email }))}
            />
          </Form.Item>
          {!!selected?.inboundCount && (
            <Form.Item
              name="ownerId"
              label="入站接收管理员"
              rules={[{ required: true, message: '请选择接收管理员' }]}
            >
              <Select
                options={users
                  .filter((u) => u.role === 'admin')
                  .map((u) => ({ value: u.id, label: u.username }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
