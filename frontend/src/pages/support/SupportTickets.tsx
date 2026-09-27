import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { HttpUtil } from '@/utils';
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
async function get<T>(path: string) {
  const r = await HttpUtil.get<T>('/panel/api/support/' + path, undefined, { silent: true });
  if (!r.success) throw new Error(r.msg);
  return r.obj!;
}
export default function SupportTickets({ admin = false }: { admin?: boolean }) {
  const [selected, setSelected] = useState<number>();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();
  const [reply, setReply] = useState('');
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
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          工单服务
        </Typography.Title>
        {!admin && (
          <Button
            type="primary"
            onClick={() => {
              setError('');
              setCreating(true);
            }}
          >
            提交工单
          </Button>
        )}
        <Button loading={list.isFetching} onClick={() => void list.refetch()}>
          刷新
        </Button>
      </Space>
      <p>
        请描述遇到的问题、设备和客户端名称。请勿填写密码或完整订阅链接。最多显示最近 200 个工单。
      </p>
      {list.isError && <Alert type="error" title={String(list.error)} />}
      {error && !creating && !selected && <Alert type="error" title={error} />}
      <Table<Ticket>
        rowKey="id"
        dataSource={list.data}
        loading={list.isLoading}
        scroll={{ x: 560 }}
        columns={[
          { title: '编号', dataIndex: 'id', width: 75 },
          {
            title: '标题',
            dataIndex: 'subject',
            render: (value, row) => (
              <Button
                type="link"
                style={{ whiteSpace: 'normal', textAlign: 'left', height: 'auto' }}
                onClick={() => {
                  setSelected(row.id);
                  setReply('');
                  setError('');
                }}
              >
                {value}
              </Button>
            ),
          },
          ...(admin ? [{ title: '用户 ID', dataIndex: 'userId' }] : []),
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: string) => (
              <Tag color={v === '待处理' ? 'orange' : v === '已回复' ? 'blue' : 'default'}>{v}</Tag>
            ),
          },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            render: (v: number) => new Date(v).toLocaleString('zh-CN'),
          },
        ]}
      />
      <Modal
        title="提交工单"
        open={creating}
        onCancel={() => !busy && setCreating(false)}
        okText="提交"
        cancelText="取消"
        confirmLoading={busy}
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        onOk={() => form.submit()}
      >
        {error && <Alert type="error" title={error} />}
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => void send('tickets', v, true)}
          disabled={busy}
        >
          <Form.Item name="subject" label="问题标题" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="body" label="问题描述" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={6} maxLength={3000} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={detail.data ? `#${selected} ${detail.data.ticket.subject}` : '工单详情'}
        open={!!selected}
        onCancel={() => !busy && setSelected(undefined)}
        footer={null}
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        width={700}
      >
        {error && <Alert type="error" title={error} />}
        {detail.isError && <Alert type="error" title={String(detail.error)} />}
        {detail.isLoading && <p>加载中…</p>}
        {detail.data && (
          <>
            <Tag>{detail.data.ticket.status}</Tag>
            <div style={{ maxHeight: '45vh', overflowY: 'auto', margin: '16px 0' }}>
              {detail.data.messages.map((m) => (
                <article
                  key={m.id}
                  style={{ borderBottom: '1px solid var(--ant-color-border)', padding: '12px 0' }}
                >
                  <strong>{m.fromAdmin ? '管理员' : '用户'}</strong>{' '}
                  <Typography.Text type="secondary">
                    {new Date(m.createdAt).toLocaleString('zh-CN')}
                  </Typography.Text>
                  <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</p>
                </article>
              ))}
            </div>
            {detail.data.ticket.status !== '已关闭' && (
              <>
                <Input.TextArea
                  aria-label="回复内容"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  maxLength={3000}
                  disabled={busy}
                />
                <Space style={{ marginTop: 12 }}>
                  <Button
                    type="primary"
                    loading={busy}
                    disabled={!reply.trim()}
                    onClick={() => void send(`tickets/${selected}/reply`, { body: reply })}
                  >
                    发送回复
                  </Button>
                  <Popconfirm
                    title="确认问题已解决并关闭工单？"
                    onConfirm={() => send(`tickets/${selected}/close`, {})}
                  >
                    <Button disabled={busy}>关闭工单</Button>
                  </Popconfirm>
                </Space>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
