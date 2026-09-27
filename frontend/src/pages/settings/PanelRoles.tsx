import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AppstoreOutlined,
  ClusterOutlined,
  DashboardOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  ImportOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';

import { HttpUtil } from '@/utils';

export interface PanelRoleInfo {
  key: string;
  name: string;
  pages: string[];
  system: boolean;
}

const JSON_REQUEST = { headers: { 'Content-Type': 'application/json' }, silent: true } as const;

export const grantablePages = [
  { key: '/', icon: DashboardOutlined, label: 'menu.dashboard' },
  { key: '/inbounds', icon: ImportOutlined, label: 'menu.inbounds' },
  { key: '/clients', icon: TeamOutlined, label: 'menu.clients' },
  { key: '/hosts', icon: GlobalOutlined, label: 'menu.hosts' },
  { key: '/my-subscriptions', icon: AppstoreOutlined, label: 'menu.mySubscriptions' },
  { key: '/node-monitor', icon: ClusterOutlined, label: 'nodeMonitor.title' },
] as const;

export function usePanelRoles() {
  return useQuery({
    queryKey: ['session', 'roles'],
    queryFn: async () => {
      const response = await HttpUtil.get<PanelRoleInfo[]>('/panel/api/setting/roles', undefined, {
        silent: true,
      });
      if (!response.success) throw new Error(response.msg || 'Could not load roles');
      return response.obj ?? [];
    },
  });
}

export function panelRoleName(role: PanelRoleInfo, t: (key: string) => string): string {
  if (role.key === 'admin') return t('pages.settings.security.roleAdmin');
  if (role.key === 'user') return t('pages.settings.security.roleUser');
  return role.name;
}

export default function PanelRoles() {
  const { t } = useTranslation();
  const roles = usePanelRoles();
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [editing, setEditing] = useState<PanelRoleInfo | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string; pages: string[] }>();
  const pageName = (key: string) => {
    const page = grantablePages.find((item) => item.key === key);
    return page ? t(page.label) : key;
  };

  const openEditor = (role: PanelRoleInfo | 'new') => {
    setEditing(role);
    form.setFieldsValue(
      role === 'new' ? { name: '', pages: ['/'] } : { name: role.name, pages: role.pages },
    );
  };

  const saveRole = async (values: { name: string; pages: string[] }) => {
    if (!editing) return;
    setSaving(true);
    try {
      const url =
        editing === 'new' ? '/panel/api/setting/roles' : `/panel/api/setting/roles/${editing.key}`;
      const response = await HttpUtil.post(url, values, JSON_REQUEST);
      if (!response.success) throw new Error(response.msg || 'Could not save role');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['session', 'roles'] });
      messageApi.success(t('pages.settings.security.roleSaved', { defaultValue: 'Role saved' }));
    } catch (error) {
      messageApi.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role: PanelRoleInfo) => {
    const response = await HttpUtil.post(
      `/panel/api/setting/roles/delete/${role.key}`,
      undefined,
      JSON_REQUEST,
    );
    if (!response.success) {
      messageApi.error(response.msg || 'Could not delete role');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['session', 'roles'] });
    messageApi.success(t('pages.settings.security.roleDeleted', { defaultValue: 'Role deleted' }));
  };

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <div className="panel-users-toolbar">
        <Typography.Text type="secondary">
          {t('pages.settings.security.rolePageHelp', {
            defaultValue: 'Create a role and select the pages its users can access.',
          })}
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor('new')}>
          {t('pages.settings.security.roleCreate', { defaultValue: 'Create role' })}
        </Button>
      </div>
      {roles.isError && (
        <Alert type="error" title={String(roles.error)} style={{ marginBottom: 12 }} />
      )}
      <Table<PanelRoleInfo>
        rowKey="key"
        size="small"
        loading={roles.isLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        dataSource={roles.data ?? []}
        columns={[
          {
            title: t('pages.settings.security.roleLabel'),
            render: (_, role) => panelRoleName(role, t),
          },
          {
            title: t('pages.settings.security.pages', { defaultValue: 'Pages' }),
            render: (_, role) =>
              role.key === 'admin' ? (
                t('pages.settings.security.allPages', { defaultValue: 'All pages' })
              ) : (
                <Space wrap>
                  {role.pages.map((page) => (
                    <Tag key={page}>{pageName(page)}</Tag>
                  ))}
                </Space>
              ),
          },
          {
            title: t('pages.settings.security.actions', { defaultValue: 'Actions' }),
            render: (_, role) =>
              role.system ? (
                <Typography.Text type="secondary">
                  {t('pages.settings.security.builtInRole', { defaultValue: 'Built-in role' })}
                </Typography.Text>
              ) : (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(role)}>
                    {t('edit')}
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      modal.confirm({
                        title: t('pages.settings.security.deleteRoleConfirm', {
                          defaultValue: 'Delete role {{name}}?',
                          name: role.name,
                        }),
                        okButtonProps: { danger: true },
                        onOk: () => deleteRole(role),
                      })
                    }
                  >
                    {t('delete')}
                  </Button>
                </Space>
              ),
          },
        ]}
      />
      <Modal
        open={editing !== null}
        title={
          editing === 'new'
            ? t('pages.settings.security.roleCreate', { defaultValue: 'Create role' })
            : t('pages.settings.security.roleEdit', { defaultValue: 'Edit role' })
        }
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={(values) => void saveRole(values)}>
          <Form.Item
            name="name"
            label={t('pages.settings.security.roleName', { defaultValue: 'Role name' })}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            name="pages"
            label={t('pages.settings.security.pages', { defaultValue: 'Pages' })}
            rules={[{ required: true, type: 'array', min: 1 }]}
          >
            <Checkbox.Group className="role-page-grid">
              {grantablePages.map((page) => {
                const Icon = page.icon;
                return (
                  <Checkbox key={page.key} value={page.key}>
                    <Icon aria-hidden /> {t(page.label)}
                  </Checkbox>
                );
              })}
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
