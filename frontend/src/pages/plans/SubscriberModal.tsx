import { FormProvider } from 'react-hook-form';
import { FormField, useZodForm } from '@/components/form/rhf';
import {
  SubscriberFormSchema,
  subscriberDefaults,
  type SubscriberValues,
} from '@/schemas/commerce';
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
  const form = useZodForm(SubscriberFormSchema, {
    defaultValues: { ...subscriberDefaults, assigning },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(v: SubscriberValues) {
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
      onOk={() => void form.handleSubmit(save)()}
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
          : '默认账号与密码为 user / user，可在创建前修改。账号需要唯一；创建后选择用户并分配套餐。'}
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
      <FormProvider {...form}>
        <Form layout="vertical" disabled={saving}>
          {!assigning && (
            <>
              <FormField name="username" label="登录账号">
                <Input autoComplete="off" maxLength={120} />
              </FormField>
              <FormField name="password" label="登录密码">
                <Input.Password autoComplete="new-password" />
              </FormField>
            </>
          )}
          {assigning && (
            <FormField name="planId" label="订阅套餐">
              <Select
                loading={plans.isLoading}
                options={plans.data
                  ?.filter((p) => p.enabled)
                  .map((p) => ({ value: p.id, label: `${p.name} — ${planSummary(p)}` }))}
              />
            </FormField>
          )}
        </Form>
      </FormProvider>
    </Modal>
  );
}
