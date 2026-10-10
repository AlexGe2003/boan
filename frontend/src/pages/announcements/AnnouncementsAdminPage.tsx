import { useState } from 'react';
import {
  Table,
  Button,
  Card,
  Tag,
  Switch,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  message,
  Space,
  Typography,
  Tooltip,
} from 'antd';
import {
  NotificationOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PushpinFilled,
  ReloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HttpUtil } from '@/utils';
import type { Announcement } from '@/models/announcement';
import { getAnnouncementTagProps } from '../subscriptions/AnnouncementModal';
import AnnouncementModal from '../subscriptions/AnnouncementModal';

const { Text } = Typography;

export default function AnnouncementsAdminPage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [previewItem, setPreviewItem] = useState<Announcement | null>(null);

  const { data: announcements = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: async () => {
      const res = await HttpUtil.get<Announcement[]>('/panel/api/announcements?all=1');
      return res.success ? (res.obj || []) : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Partial<Announcement>) => {
      if (editingItem) {
        const res = await HttpUtil.put<Announcement>(`/panel/api/announcements/${editingItem.id}`, values);
        if (!res.success) throw new Error(res.msg || '更新失败');
        return res;
      } else {
        const res = await HttpUtil.post<Announcement>('/panel/api/announcements', values);
        if (!res.success) throw new Error(res.msg || '发布失败');
        return res;
      }
    },
    onSuccess: () => {
      message.success(editingItem ? '公告更新成功' : '公告发布成功');
      setModalOpen(false);
      setEditingItem(null);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (err: Error) => {
      message.error(err.message || '操作失败');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await HttpUtil.delete(`/panel/api/announcements/${id}`);
      if (!res.success) throw new Error(res.msg || '删除失败');
      return res;
    },
    onSuccess: () => {
      message.success('公告已删除');
      void queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (err: Error) => {
      message.error(err.message || '删除失败');
    },
  });

  const toggleStatus = async (item: Announcement, field: 'enabled' | 'popup' | 'pinned', val: boolean) => {
    try {
      const res = await HttpUtil.put(`/panel/api/announcements/${item.id}`, { [field]: val });
      if (res.success) {
        message.success('设置已更新');
        void queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
        void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      } else {
        message.error(res.msg || '更新失败');
      }
    } catch {
      message.error('网络错误');
    }
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      tag: 'notice',
      popup: true,
      pinned: false,
      enabled: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (item: Announcement) => {
    setEditingItem(item);
    form.setFieldsValue({
      title: item.title,
      content: item.content,
      tag: item.tag,
      popup: item.popup,
      pinned: item.pinned,
      enabled: item.enabled,
    });
    setModalOpen(true);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 65,
    },
    {
      title: '标题与标签',
      key: 'title',
      render: (_: unknown, record: Announcement) => {
        const tagProps = getAnnouncementTagProps(record.tag);
        return (
          <Space direction="vertical" size={2}>
            <Space wrap>
              {record.pinned && (
                <Tag color="red" icon={<PushpinFilled />} bordered={false}>
                  置顶
                </Tag>
              )}
              <Tag color={tagProps.color} bordered={false}>
                {tagProps.label}
              </Tag>
              <Text strong>{record.title}</Text>
            </Space>
            <Text type="secondary" ellipsis={{ tooltip: record.content }} style={{ maxWidth: 360, fontSize: 12 }}>
              {record.content}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '首次弹窗',
      key: 'popup',
      width: 100,
      render: (_: unknown, record: Announcement) => (
        <Tooltip title="用户首次登录/进入用户中心时是否弹出提醒">
          <Switch
            checked={record.popup}
            checkedChildren="弹窗"
            unCheckedChildren="静默"
            onChange={(val) => toggleStatus(record, 'popup', val)}
          />
        </Tooltip>
      ),
    },
    {
      title: '置顶',
      key: 'pinned',
      width: 85,
      render: (_: unknown, record: Announcement) => (
        <Switch
          checked={record.pinned}
          checkedChildren="置顶"
          unCheckedChildren="普通"
          onChange={(val) => toggleStatus(record, 'pinned', val)}
        />
      ),
    },
    {
      title: '状态',
      key: 'enabled',
      width: 90,
      render: (_: unknown, record: Announcement) => (
        <Switch
          checked={record.enabled}
          checkedChildren="启用"
          unCheckedChildren="隐藏"
          onChange={(val) => toggleStatus(record, 'enabled', val)}
        />
      ),
    },
    {
      title: '发布时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (val: number) =>
        val ? new Date(val).toLocaleString('zh-CN', { hour12: false }) : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: Announcement) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setPreviewItem(record)}
            title="预览用户视角效果"
          />
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该公告？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        bordered={false}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <span>系统公告管理</span>
          </div>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
              发布新公告
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={announcements}
          loading={isLoading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingItem ? '编辑公告' : '发布新公告'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnClose
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="title"
            label="公告标题"
            rules={[{ required: true, message: '请输入公告标题' }]}
          >
            <Input placeholder="例如：关于节点定期网络维护升级公告" maxLength={100} showCount />
          </Form.Item>

          <Form.Item name="tag" label="分类标签" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'notice', label: '系统通知（蓝色）' },
                { value: 'maintenance', label: '维护更新（橙色）' },
                { value: 'feature', label: '功能更新（绿色）' },
                { value: 'urgent', label: '重要警报（红色）' },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
            <Form.Item
              name="popup"
              label="首次弹窗提醒"
              valuePropName="checked"
              extra="开启后，用户进入用户中心时会自动弹窗提醒该公告"
              style={{ flex: 1, margin: 0 }}
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

            <Form.Item
              name="pinned"
              label="置顶显示"
              valuePropName="checked"
              extra="开启后将在列表中置顶展示"
              style={{ flex: 1, margin: 0 }}
            >
              <Switch checkedChildren="置顶" unCheckedChildren="普通" />
            </Form.Item>

            <Form.Item
              name="enabled"
              label="是否启用"
              valuePropName="checked"
              extra="关闭后对普通用户隐藏"
              style={{ flex: 1, margin: 0 }}
            >
              <Switch checkedChildren="启用" unCheckedChildren="隐藏" />
            </Form.Item>
          </div>

          <Form.Item
            name="content"
            label="公告内容"
            rules={[{ required: true, message: '请输入公告内容' }]}
          >
            <Input.TextArea
              rows={8}
              placeholder="请输入公告正文，支持换行与段落格式..."
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* User Perspective Preview Modal */}
      <AnnouncementModal
        open={!!previewItem}
        announcement={previewItem}
        onAcknowledge={() => setPreviewItem(null)}
      />
    </div>
  );
}
