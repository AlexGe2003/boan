import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Form, Input, Modal, Typography } from 'antd';
import { HttpUtil } from '@/utils';

export default function ClientAccountModal({
  email,
  onClose,
}: {
  email: string | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm<{ username: string; password?: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const account = useQuery({
    queryKey: ['clientAccount', email],
    enabled: !!email,
    staleTime: 0,
    queryFn: async () => {
      const msg = await HttpUtil.get<{ username: string }>(
        `/panel/api/clients/account/${encodeURIComponent(email!)}`,
        undefined,
        { silent: true },
      );
      if (!msg.success) throw new Error(msg.msg);
      return msg.obj;
    },
  });
  const loading = account.isFetching;
  const exists = !!account.data?.username;
  useEffect(() => {
    if (account.isSuccess)
      form.setFieldsValue({ username: account.data?.username || email || '', password: '' });
  }, [account.data, account.isSuccess, email, form]);
  async function save(values: { username: string; password?: string }) {
    if (!email) return;
    setSaving(true);
    const msg = await HttpUtil.post(
      `/panel/api/clients/account/${encodeURIComponent(email)}`,
      values,
      {
        headers: { 'Content-Type': 'application/json' },
        silent: true,
      },
    );
    setSaving(false);
    if (!msg.success) setError(msg.msg);
    else {
      await account.refetch();
      onClose();
    }
  }
  return (
    <Modal
      open={email !== null}
      title="用户登录账号"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      okButtonProps={{ disabled: loading || account.isError }}
    >
      <Typography.Paragraph>
        {email}：用户登录后可查看自己的流量、到期时间和订阅。
      </Typography.Paragraph>
      {account.isError && <Alert type="error" title={String(account.error)} />}
      {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" onFinish={save} disabled={loading || saving}>
        <Form.Item name="username" label="登录账号" rules={[{ required: true, whitespace: true }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label={exists ? '新密码（留空保留原密码）' : '登录密码'}
          rules={[{ required: !exists }, { min: 8 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
