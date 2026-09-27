import { useState } from 'react';
import { Alert, Form, Input, Modal, Select, Typography } from 'antd';
import { useSubscriptionPlans, postPlan, planSummary } from './api';
export default function SubscriberModal({
  emails,
  onClose,
  onSaved,
}: {
  emails?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const assigning = !!emails;
  const plans = useSubscriptionPlans(assigning);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(v: { username: string; password: string; planId: number }) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await postPlan<{ created?: boolean; email?: string }>(
        assigning ? 'apply' : 'subscribe',
        assigning ? { planId: v.planId, emails } : { username: v.username, password: v.password },
      );
      onSaved();
      if (!result.success) {
        setError(result.msg);
        return;
      }
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      cancelText="取消"
      title={assigning ? '批量分配套餐' : '创建用户账号'}
      onCancel={() => !saving && onClose()}
      onOk={() => form.submit()}
      confirmLoading={saving}
      okText={assigning ? '分配套餐' : '创建用户'}
      okButtonProps={{
        disabled:
          saving ||
          (assigning && (plans.isLoading || plans.isError || !plans.data?.some((p) => p.enabled))),
      }}
    >
      <Typography.Paragraph>
        {assigning
          ? `将套餐应用到选中的 ${emails.length} 个用户，统一设置节点、额度和使用限制。`
          : '填写登录账号和密码即可创建用户。创建后可在用户列表中选择用户，再分配订阅套餐。'}
      </Typography.Paragraph>
      {assigning && (
        <Alert
          type="info"
          title="更换套餐将重新计算有效期；同步同套餐保留到期时间。已用流量不会清零。"
          style={{ marginBottom: 16 }}
        />
      )}
      {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
      {assigning && plans.isError && <Alert type="error" title={String(plans.error)} />}
      {assigning && plans.isSuccess && !plans.data.some((p) => p.enabled) && (
        <Alert type="info" title="请先在“订阅套餐”页面创建并启用套餐。" />
      )}
      <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
        {!assigning && (
          <>
            <Form.Item
              name="username"
              label="登录账号"
              rules={[
                { required: true, whitespace: true },
                { pattern: /^[^\s/\\]+$/, message: '账号不能包含空格或斜线' },
              ]}
            >
              <Input autoComplete="off" maxLength={120} />
            </Form.Item>
            <Form.Item name="password" label="登录密码" rules={[{ required: true }, { min: 8 }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </>
        )}
        {assigning && (
          <Form.Item
            name="planId"
            label="订阅套餐"
            rules={[{ required: true, message: '请选择套餐' }]}
          >
            <Select
              loading={plans.isLoading}
              options={plans.data
                ?.filter((p) => p.enabled)
                .map((p) => ({ value: p.id, label: `${p.name} — ${planSummary(p)}` }))}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
