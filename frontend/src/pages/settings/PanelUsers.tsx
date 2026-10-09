import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Modal, Select, Table, Tag, Typography, message } from 'antd';

import { HttpUtil } from '@/utils';
import { usePanelAccess } from '@/api/queries/usePanelRole';
import LegacyAccountMigration from './LegacyAccountMigration';
import './PanelUsersPage.css';

interface PanelUser {
  id: number;
  username: string;
  role: string;
  inboundCount: number;
  subscriptionStatus?: 'linked' | 'missing' | 'unbound';
}

interface CreateValues {
  username: string;
  password: string;
}

const JSON_REQUEST = { headers: { 'Content-Type': 'application/json' }, silent: true } as const;

export default function PanelUsers() {
  const { t } = useTranslation();
  const access = usePanelAccess();
  const [searchParams] = useSearchParams();
  const orphanTarget = searchParams.get('orphanAccount');
  const role = access.role;
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PanelUser | null>(null);
  const [deleting, setDeleting] = useState<PanelUser | null>(null);
  const [transferTo, setTransferTo] = useState<number | undefined>();
  const [deleteError, setDeleteError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createForm] = Form.useForm<CreateValues>();
  const [editForm] = Form.useForm<{ username: string }>();

  const users = useQuery({
    queryKey: ['session', 'users'],
    enabled: role === 'admin',
    queryFn: async () => {
      const msg = await HttpUtil.get<PanelUser[]>('/panel/api/setting/users', undefined, {
        silent: true,
      });
      if (!msg.success) throw new Error(msg.msg || 'Could not load accounts');
      return msg.obj ?? [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['session', 'users'] });
  const createUser = useMutation({
    mutationFn: async (values: CreateValues) => {
      const msg = await HttpUtil.post(
        '/panel/api/setting/users',
        { ...values, role: 'admin' },
        JSON_REQUEST,
      );
      if (!msg.success) throw new Error(msg.msg || 'Could not create account');
    },
    onSuccess: () => {
      setCreateOpen(false);
      createForm.resetFields();
      void refresh();
      messageApi.success(
        t('pages.settings.security.userCreated', { defaultValue: 'Account created' }),
      );
    },
  });

  const updateUsername = useMutation({
    mutationFn: async (values: { username: string }) => {
      if (!editing) return;
      const msg = await HttpUtil.post(
        `/panel/api/setting/users/name/${editing.id}`,
        values,
        JSON_REQUEST,
      );
      if (!msg.success) throw new Error(msg.msg || 'Could not update account');
    },
    onSuccess: () => {
      setEditing(null);
      void refresh();
      messageApi.success(
        t('pages.settings.security.userUpdated', { defaultValue: 'Account updated' }),
      );
    },
  });

  async function deleteUser() {
    if (!deleting) return;
    if (deleting.inboundCount > 0 && !transferTo) {
      setDeleteError(t('pages.settings.security.transferRequired'));
      return;
    }
    setBusyId(deleting.id);
    setDeleteError('');
    try {
      const msg = await HttpUtil.post(
        `/panel/api/setting/users/delete/${deleting.id}`,
        {
          reassignTo: transferTo ?? 0,
          ...(deleting.role === 'customer' ? { onlyOrphan: true } : {}),
        },
        JSON_REQUEST,
      );
      if (!msg.success) throw new Error(msg.msg || 'Could not delete account');
      setDeleting(null);
      setTransferTo(undefined);
      await refresh();
      messageApi.success(t('pages.settings.security.userDeleted'));
    } catch (error) {
      setDeleteError(String(error));
    } finally {
      setBusyId(null);
    }
  }

  const orphanAccounts = (users.data ?? [])
    .filter(
      (item) =>
        item.role === 'customer' && ['missing', 'unbound'].includes(item.subscriptionStatus ?? ''),
    )
    .sort((a, b) => Number(b.username === orphanTarget) - Number(a.username === orphanTarget));

  if (role !== 'admin') return null;

  return (
    <section className="users-page">
      {contextHolder}
      <Typography.Title level={4}>管理员账号</Typography.Title>
      <div className="panel-users-toolbar">
        <Typography.Text type="secondary">
          管理员可管理系统配置；订阅用户请在“用户管理”中创建并分配套餐。
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          创建管理员
        </Button>
      </div>
      {users.isError && (
        <Alert type="error" title={String(users.error)} style={{ marginBottom: 12 }} />
      )}
      <Table<PanelUser>
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        loading={users.isLoading}
        dataSource={(users.data ?? []).filter((item) => item.role === 'admin')}
        scroll={{ x: 650 }}
        columns={[
          { title: t('username'), dataIndex: 'username' },
          {
            title: t('pages.settings.security.actions', { defaultValue: 'Actions' }),
            render: (_, row) => (
              <div className="panel-user-actions">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(row);
                    editForm.setFieldsValue({ username: row.username });
                  }}
                >
                  {t('edit')}
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={row.id === access.userId}
                  onClick={() => {
                    setDeleting(row);
                    setTransferTo(undefined);
                    setDeleteError('');
                  }}
                >
                  {t('pages.settings.security.userDelete')}
                </Button>
              </div>
            ),
          },
        ]}
      />
      {orphanAccounts.length > 0 && (
        <section className="orphan-accounts" aria-label="失效订阅账号">
          <Typography.Title level={4}>失效订阅账号</Typography.Title>
          <Alert
            type="warning"
            showIcon
            title="登录账号仍存在，但没有有效的订阅绑定"
            description="这些登录名仍被占用。确认账号不再使用后，可删除失效登录账号，再回到用户管理重新创建；此操作不会删除其他用户的订阅。"
            style={{ marginBottom: 12 }}
          />
          <Table<PanelUser>
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            dataSource={orphanAccounts}
            scroll={{ x: 480 }}
            columns={[
              {
                title: '登录账号',
                dataIndex: 'username',
                render: (username: string) => (
                  <span>
                    {username}
                    {username === orphanTarget && <Tag color="blue">当前查找</Tag>}
                  </span>
                ),
              },
              {
                title: '订阅状态',
                render: (_, row) =>
                  row.subscriptionStatus === 'missing' ? '关联订阅已删除' : '未绑定订阅',
              },
              {
                title: '操作',
                render: (_, row) => (
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined aria-hidden />}
                    onClick={() => {
                      setDeleting(row);
                      setTransferTo(undefined);
                      setDeleteError('');
                    }}
                  >
                    删除失效账号
                  </Button>
                ),
              },
            ]}
          />
        </section>
      )}
      <LegacyAccountMigration users={users.data ?? []} onSaved={refresh} />
      <Modal
        cancelText="取消"
        open={deleting !== null}
        title={
          deleting?.role === 'customer'
            ? `删除失效登录账号：${deleting.username}`
            : t('pages.settings.security.deleteConfirm', { username: deleting?.username })
        }
        okButtonProps={{ danger: true }}
        okText={
          deleting?.role === 'customer'
            ? '确认删除失效账号'
            : t('pages.settings.security.userDelete')
        }
        confirmLoading={busyId === deleting?.id}
        onCancel={() => {
          setDeleting(null);
          setDeleteError('');
        }}
        onOk={() => void deleteUser()}
      >
        {deleteError && <Alert type="error" title={deleteError} style={{ marginBottom: 12 }} />}
        <Typography.Paragraph>
          {deleting?.role === 'customer'
            ? '仅删除这个失效登录账号并释放登录名，原登录会话将失效。有效订阅用户和管理员账号不受影响。'
            : t('pages.settings.security.deleteAccountWarning')}
        </Typography.Paragraph>
        {deleting && deleting.inboundCount > 0 && (
          <>
            <Typography.Paragraph>
              {t('pages.settings.security.transferCount', { count: deleting.inboundCount })}
            </Typography.Paragraph>
            <Select
              value={transferTo}
              placeholder={t('pages.settings.security.transferTarget')}
              style={{ width: '100%' }}
              options={(users.data ?? [])
                .filter((item) => item.role === 'admin' && item.id !== deleting.id)
                .map((item) => ({ value: item.id, label: item.username }))}
              onChange={(value) => {
                setTransferTo(value);
                setDeleteError('');
              }}
            />
          </>
        )}
      </Modal>
      <Modal
        okText="保存"
        cancelText="取消"
        open={editing !== null}
        title={t('pages.settings.security.userEdit', { defaultValue: 'Edit account' })}
        onCancel={() => {
          setEditing(null);
          updateUsername.reset();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateUsername.isPending}
      >
        {updateUsername.isError && (
          <Alert type="error" title={String(updateUsername.error)} style={{ marginBottom: 12 }} />
        )}
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => updateUsername.mutate(values)}
        >
          <Form.Item
            name="username"
            label={t('username')}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        okText="创建"
        cancelText="取消"
        open={createOpen}
        title="创建管理员"
        onCancel={() => {
          setCreateOpen(false);
          createUser.reset();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createUser.isPending}
      >
        {createUser.isError && (
          <Alert type="error" title={String(createUser.error)} style={{ marginBottom: 12 }} />
        )}
        <Typography.Paragraph type="secondary">
          此账号拥有后台管理权限。普通订阅用户请在“用户管理”中创建。
        </Typography.Paragraph>
        <Form form={createForm} layout="vertical" onFinish={(values) => createUser.mutate(values)}>
          <Form.Item
            name="username"
            label={t('username')}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" label={t('password')} rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
