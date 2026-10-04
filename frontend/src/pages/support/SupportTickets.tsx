import { useMemo, useRef, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CustomerServiceOutlined,
  FieldTimeOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { HttpUtil } from '@/utils';
import './SupportTickets.css';

interface Ticket {
  id: number;
  userId: number;
  subject: string;
  status: string;
  updatedAt: number;
}

interface Reply {
  id: number;
  fromAdmin: boolean;
  body: string;
  createdAt: number;
}

const CATEGORY_PRESETS = [
  { label: '⚡ 节点连接异常', value: '[节点连接] ' },
  { label: '📱 客户端与订阅', value: '[客户端配置] ' },
  { label: '💳 流量与套餐账单', value: '[流量账单] ' },
  { label: '🔐 账号与登录', value: '[账号安全] ' },
  { label: '💬 功能建议与反馈', value: '[功能建议] ' },
];

async function get<T>(path: string) {
  const r = await HttpUtil.get<T>('/panel/api/support/' + path, undefined, { silent: true });
  if (!r.success) throw new Error(r.msg);
  return r.obj!;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '-';
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export default function SupportTickets({ admin = false }: { admin?: boolean }) {
  const [selected, setSelected] = useState<number>();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [form] = Form.useForm();
  const [reply, setReply] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const list = useQuery({
    queryKey: ['support-tickets', admin],
    queryFn: () => get<Ticket[]>('tickets'),
    refetchInterval: 30000,
  });

  const detail = useQuery({
    queryKey: ['support-ticket', selected],
    enabled: !!selected,
    queryFn: () => get<{ ticket: Ticket; messages: Reply[] }>('tickets/' + selected),
    refetchInterval: 15000,
  });

  // Auto-scroll chat history on new messages or modal open
  useEffect(() => {
    if (detail.data?.messages) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [detail.data?.messages, selected]);

  const stats = useMemo(() => {
    const raw = list.data || [];
    return {
      total: raw.length,
      pending: raw.filter((t) => t.status === '待处理').length,
      replied: raw.filter((t) => t.status === '已回复').length,
      closed: raw.filter((t) => t.status === '已关闭').length,
    };
  }, [list.data]);

  const filteredTickets = useMemo(() => {
    const raw = list.data || [];
    return raw.filter((item) => {
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'pending'
            ? item.status === '待处理'
            : statusFilter === 'replied'
              ? item.status === '已回复'
              : item.status === '已关闭';
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        item.subject.toLowerCase().includes(term) ||
        String(item.id).includes(term) ||
        String(item.userId).includes(term);
      return matchStatus && matchSearch;
    });
  }, [list.data, statusFilter, search]);

  async function send(path: string, values: unknown, create = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await HttpUtil.post('/panel/api/support/' + path, values, {
        headers: { 'Content-Type': 'application/json' },
        silent: true,
      });
      if (!r.success) throw new Error(r.msg);
      if (create) {
        setCreating(false);
        form.resetFields();
      } else {
        setReply('');
        await detail.refetch();
      }
      await list.refetch();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const handleApplyPreset = (prefix: string) => {
    const current = form.getFieldValue('subject') || '';
    if (!current.startsWith('[')) {
      form.setFieldsValue({ subject: prefix + current });
    } else {
      form.setFieldsValue({ subject: prefix + current.replace(/^\[.*?\]\s*/, '') });
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case '待处理':
        return (
          <Tag color="orange" icon={<ClockCircleOutlined />}>
            待处理
          </Tag>
        );
      case '已回复':
        return (
          <Tag color="blue" icon={<CheckCircleOutlined />}>
            已回复
          </Tag>
        );
      case '已关闭':
        return (
          <Tag color="default" icon={<CloseCircleOutlined />}>
            已关闭
          </Tag>
        );
      default:
        return <Tag>{status}</Tag>;
    }
  };

  return (
    <div className="support-tickets-container">
      {/* Top Header */}
      <div className="tickets-header">
        <div className="tickets-header-title">
          <span className="tickets-eyebrow">
            <CustomerServiceOutlined /> {admin ? '管理工单服务' : '用户支持中心'}
          </span>
          <Typography.Title level={2} style={{ margin: 0 }}>
            工单服务
          </Typography.Title>
          <p className="tickets-header-desc">
            {admin
              ? '处理用户的连接、配置与账单问题，保持及时沟通。'
              : '如遇节点超时、配置异常或订阅问题，请随时提交工单，我们将尽快回复。'}
          </p>
        </div>
        <Space size="middle">
          {!admin && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setError('');
                form.resetFields();
                setCreating(true);
              }}
            >
              提交工单
            </Button>
          )}
          <Button
            icon={<ReloadOutlined />}
            loading={list.isFetching}
            onClick={() => void list.refetch()}
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* Stats Summary Cards */}
      <div className="tickets-stats-grid">
        <button
          type="button"
          className={`ticket-stat-card ${statusFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <div className="ticket-stat-info">
            <span className="ticket-stat-label">全部工单</span>
            <span className="ticket-stat-value">{stats.total}</span>
          </div>
          <div className="ticket-stat-icon total">
            <MessageOutlined />
          </div>
        </button>
        <button
          type="button"
          className={`ticket-stat-card ${statusFilter === 'pending' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          <div className="ticket-stat-info">
            <span className="ticket-stat-label">待处理</span>
            <span className="ticket-stat-value">{stats.pending}</span>
          </div>
          <div className="ticket-stat-icon pending">
            <ClockCircleOutlined />
          </div>
        </button>
        <button
          type="button"
          className={`ticket-stat-card ${statusFilter === 'replied' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('replied')}
        >
          <div className="ticket-stat-info">
            <span className="ticket-stat-label">已回复</span>
            <span className="ticket-stat-value">{stats.replied}</span>
          </div>
          <div className="ticket-stat-icon replied">
            <CustomerServiceOutlined />
          </div>
        </button>
        <button
          type="button"
          className={`ticket-stat-card ${statusFilter === 'closed' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('closed')}
        >
          <div className="ticket-stat-info">
            <span className="ticket-stat-label">已结单</span>
            <span className="ticket-stat-value">{stats.closed}</span>
          </div>
          <div className="ticket-stat-icon closed">
            <CheckCircleOutlined />
          </div>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="tickets-toolbar">
        <Segmented
          options={[
            { label: `全部 (${stats.total})`, value: 'all' },
            { label: `待处理 (${stats.pending})`, value: 'pending' },
            { label: `已回复 (${stats.replied})`, value: 'replied' },
            { label: `已关闭 (${stats.closed})`, value: 'closed' },
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
        />
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />}
          placeholder="搜索工单标题 / ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 280 }}
        />
      </div>

      {list.isError && (
        <Alert
          type="error"
          title="加载工单列表失败"
          description={String(list.error)}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {error && !creating && !selected && (
        <Alert
          type="error"
          title={error}
          showIcon
          closable
          onClose={() => setError('')}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Ticket List Table */}
      <div className="tickets-card">
        <Table<Ticket>
          rowKey="id"
          dataSource={filteredTickets}
          loading={list.isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条工单`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  statusFilter !== 'all' || search
                    ? '没有符合条件的工单'
                    : admin
                      ? '暂无任何工单记录'
                      : '您当前没有任何工单'
                }
              >
                {!admin && !search && statusFilter === 'all' && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setError('');
                      form.resetFields();
                      setCreating(true);
                    }}
                  >
                    立即提交工单
                  </Button>
                )}
              </Empty>
            ),
          }}
          scroll={{ x: 680 }}
          columns={[
            {
              title: '编号',
              dataIndex: 'id',
              width: 85,
              render: (id) => <Tag style={{ margin: 0 }}>#{id}</Tag>,
            },
            {
              title: '问题标题',
              dataIndex: 'subject',
              render: (value, row) => (
                <button
                  type="button"
                  className="ticket-title-link"
                  onClick={() => {
                    setSelected(row.id);
                    setReply('');
                    setError('');
                  }}
                >
                  {value}
                </button>
              ),
            },
            ...(admin
              ? [
                  {
                    title: '用户 ID',
                    dataIndex: 'userId',
                    width: 100,
                    render: (uid: number) => (
                      <Tag icon={<UserOutlined />} color="blue">
                        UID: {uid}
                      </Tag>
                    ),
                  },
                ]
              : []),
            {
              title: '状态',
              dataIndex: 'status',
              width: 110,
              render: (v: string) => getStatusTag(v),
            },
            {
              title: '更新时间',
              dataIndex: 'updatedAt',
              width: 160,
              render: (v: number) => (
                <Tooltip title={new Date(v).toLocaleString('zh-CN')}>
                  <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
                    <FieldTimeOutlined style={{ marginRight: 4 }} />
                    {formatRelativeTime(v)}
                  </span>
                </Tooltip>
              ),
            },
            {
              title: '操作',
              key: 'action',
              width: 110,
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setSelected(row.id);
                    setReply('');
                    setError('');
                  }}
                >
                  查看详情
                </Button>
              ),
            },
          ]}
        />
      </div>

      {/* Create Ticket Modal */}
      <Modal
        title={
          <Space>
            <PlusOutlined style={{ color: 'var(--ant-color-primary)' }} />
            <span>提交新工单</span>
          </Space>
        }
        open={creating}
        onCancel={() => !busy && setCreating(false)}
        okText="提交工单"
        cancelText="取消"
        confirmLoading={busy}
        closable={!busy}
        maskClosable={!busy}
        width={620}
        onOk={() => form.submit()}
      >
        <Alert
          type="info"
          showIcon
          message="提单指引"
          description="请详述遇到的问题、设备型号、客户端版本及报错信息。请勿在工单中透露密码或完整订阅密钥。"
          style={{ marginBottom: 16 }}
        />
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => void send('tickets', v, true)}
          disabled={busy}
        >
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginRight: 8 }}>
              快捷分类标签：
            </span>
            <div className="category-chips" style={{ marginTop: 6 }}>
              {CATEGORY_PRESETS.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className="category-chip"
                  onClick={() => handleApplyPreset(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <Form.Item
            name="subject"
            label="工单标题"
            rules={[{ required: true, whitespace: true, message: '请输入工单标题' }]}
          >
            <Input maxLength={60} placeholder="例如：[节点连接] 香港 01 节点持续连接超时" />
          </Form.Item>
          <Form.Item
            name="body"
            label="详细描述"
            rules={[{ required: true, whitespace: true, message: '请填写具体的问题描述' }]}
          >
            <Input.TextArea
              rows={6}
              maxLength={3000}
              showCount
              placeholder="请描述具体情况：&#10;1. 所用设备与客户端（如 Windows Clash / iOS 小火箭）&#10;2. 发生时间与具体节点&#10;3. 客户端显示的错误提示"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Ticket Details & Chat Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>#{selected}</span>
            <span style={{ fontWeight: 600 }}>{detail.data?.ticket.subject || '工单详情'}</span>
            {detail.data?.ticket.status && getStatusTag(detail.data.ticket.status)}
          </div>
        }
        open={!!selected}
        onCancel={() => !busy && setSelected(undefined)}
        footer={null}
        closable={!busy}
        maskClosable={!busy}
        width={720}
      >
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 12 }} />}
        {detail.isError && (
          <Alert
            type="error"
            title="获取工单详情失败"
            description={String(detail.error)}
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}

        {detail.isLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Typography.Text type="secondary">正在载入对话记录...</Typography.Text>
          </div>
        )}

        {detail.data && (
          <>
            {/* Ticket Information Bar */}
            <div className="ticket-chat-header">
              <Space split="·" size="middle">
                <span>
                  用户：<strong>{detail.data.ticket.userId ? `UID #${detail.data.ticket.userId}` : '当前用户'}</strong>
                </span>
                <span>最后更新：{new Date(detail.data.ticket.updatedAt).toLocaleString('zh-CN')}</span>
              </Space>
              {detail.data.ticket.status !== '已关闭' && (
                <Popconfirm
                  title="确认关闭工单？"
                  description="确认问题已解决并关闭此工单吗？"
                  onConfirm={() => send(`tickets/${selected}/close`, {})}
                  okText="确认关闭"
                  cancelText="取消"
                >
                  <Button size="small" danger disabled={busy}>
                    关闭工单
                  </Button>
                </Popconfirm>
              )}
            </div>

            {/* Chat Timeline Container */}
            <div className="ticket-chat-box">
              {detail.data.messages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-bubble-row ${m.fromAdmin ? 'admin' : 'user'}`}
                >
                  <div className={`chat-avatar ${m.fromAdmin ? 'admin' : 'user'}`}>
                    {m.fromAdmin ? <CustomerServiceOutlined /> : <UserOutlined />}
                  </div>
                  <div className="chat-bubble-content">
                    <div className="chat-meta">
                      <strong>{m.fromAdmin ? (admin ? '管理员 (我)' : '官方客服') : (admin ? `用户 (#${detail.data?.ticket.userId})` : '我')}</strong>
                      <span>{new Date(m.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <div className="chat-bubble-body">{m.body}</div>
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Reply Composer */}
            {detail.data.ticket.status !== '已关闭' ? (
              <div className="chat-reply-container">
                <Input.TextArea
                  aria-label="回复内容"
                  placeholder="请输入您的回复... (按 Ctrl+Enter 或 Cmd+Enter 快速发送)"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && reply.trim() && !busy) {
                      e.preventDefault();
                      void send(`tickets/${selected}/reply`, { body: reply });
                    }
                  }}
                  rows={4}
                  maxLength={3000}
                  showCount
                  disabled={busy}
                />
                <div className="chat-reply-actions">
                  <span className="chat-reply-tip">快捷键: Ctrl/Cmd + Enter 快速发送</span>
                  <Space>
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={busy}
                      disabled={!reply.trim()}
                      onClick={() => void send(`tickets/${selected}/reply`, { body: reply })}
                    >
                      发送回复
                    </Button>
                  </Space>
                </div>
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message="此工单已结单关闭"
                description="如需进一步帮助或有新的问题，请提交新的工单。"
                style={{ marginTop: 12 }}
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
