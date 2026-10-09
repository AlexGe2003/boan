import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Form, Input, Modal, Typography } from 'antd';
import { SubscriberPasswordSchema } from '@/schemas/commerce';
import { HttpUtil } from '@/utils';

export default function ClientAccountModal({
  email,
  onClose,
  onSaved,
}: {
  email: string | null;
  onClose: () => void;
  onSaved?: () => void;
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
      form.setFieldsValue({
        username: account.data?.username || email || '',
        password: account.data?.username ? '' : 'user',
      });
  }, [account.data, account.isSuccess, email, form]);
  async function save(values: { username: string; password?: string }) {
    if (!email || saving) return;
    setSaving(true);
    setError('');
    try {
      const msg = await HttpUtil.post(
        `/panel/api/clients/account/${encodeURIComponent(email)}`,
        values,
        {
          headers: { 'Content-Type': 'application/json' },
          silent: true,
        },
      );
      if (!msg.success) setError(msg.msg);
      else {
        await account.refetch();
        onSaved?.();
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={email !== null}
      title="管理登录账号"
      onCancel={() => !saving && onClose()}
      onOk={() => form.submit()}
      okText={exists ? '保存更改' : '创建账号'}
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: saving || loading || account.isError }}
    >
      <Typography.Paragraph>
        {email}：设置用户门户的登录用户名和密码。用户登录后可查看自己的流量、到期时间和订阅。
      </Typography.Paragraph>
      {account.isError && <Alert type="error" title={String(account.error)} />}
      {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" onFinish={save} disabled={loading || saving}>
        <Form.Item name="username" label="用户名" rules={[{ required: true, whitespace: true }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="password"
          label={exists ? '新密码（留空保留原密码）' : '登录密码'}
          rules={[
            { required: !exists },
            {
              validator: async (_, value: string) => {
                if (!value && exists) return;
                const result = SubscriberPasswordSchema.safeParse(value);
                if (!result.success) throw new Error(result.error.issues[0].message);
              },
            },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
