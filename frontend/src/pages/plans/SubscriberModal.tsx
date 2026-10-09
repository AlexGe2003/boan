import { FormProvider } from 'react-hook-form';
import { FormField, useZodForm } from '@/components/form/rhf';
import {
  SubscriberFormSchema,
  subscriberDefaults,
  type SubscriberValues,
} from '@/schemas/commerce';
import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { useSubscriptionPlans, postPlan, planSummary } from './api';

interface SubscriberResult {
  created?: boolean;
  email?: string;
  conflict?: 'subscription_exists' | 'account_exists' | 'orphan_account';
  username?: string;
  accountExists?: boolean;
}

export default function SubscriberModal({
  emails,
  onClose,
  onSaved,
  onOpenExisting,
  onManageAccount,
  onManageOrphan,
}: {
  emails?: string[];
  onClose: () => void;
  onSaved: () => void;
  onOpenExisting?: (email: string) => void;
  onManageAccount?: (email: string) => void;
  onManageOrphan?: (username: string) => void;
}) {
  const assigning = !!emails;
  const plans = useSubscriptionPlans(assigning);
  const form = useZodForm(SubscriberFormSchema, {
    defaultValues: { ...subscriberDefaults, assigning },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<SubscriberResult | null>(null);

  async function save(v: SubscriberValues) {
    if (saving) return;
    setSaving(true);
    setError('');
    setConflict(null);
    try {
      const result = await postPlan<SubscriberResult>(
        assigning ? 'apply' : 'subscribe',
        assigning
          ? { planId: v.planId, emails }
          : { username: v.username, password: v.password, accountOnly: true },
      );
      if (!result.success) {
        setError(result.msg);
        if (result.obj?.conflict) {
          setConflict(result.obj);
          form.setError('username', { type: 'server', message: result.msg });
        }
        if (assigning || result.obj?.created) onSaved();
        return;
      }
      onSaved();
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
          : '先创建登录账号。创建后选中用户，再分配套餐或配置节点。'}
      </Typography.Paragraph>
      {assigning && (
        <Alert
          type="info"
          title="更换套餐将重新计算有效期；同步同套餐保留到期时间。已用流量不会清零。"
          style={{ marginBottom: 16 }}
        />
      )}
      {error && !conflict && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
      {conflict?.email && (
        <Alert
          type="info"
          title={`原订阅：${conflict.email}${conflict.username ? ` · 登录账号：${conflict.username}` : ''}`}
          description={
            <Space wrap>
              {onOpenExisting && (
                <Button onClick={() => onOpenExisting(conflict.email!)}>
                  查看原用户并分配套餐
                </Button>
              )}
              {onManageAccount && (
                <Button onClick={() => onManageAccount(conflict.email!)}>
                  {conflict.accountExists ? '管理原登录账号' : '在原订阅上开通账号'}
                </Button>
              )}
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {conflict?.conflict === 'orphan_account' && conflict.username && (
        <Alert
          type="warning"
          title={`失效的登录账号：${conflict.username}`}
          description={
            <Space orientation="vertical">
              <span>
                该账号仍占用登录名，已从订阅用户列表隐藏。可在设置的“失效订阅账号”中查看和处理。
              </span>
              {onManageOrphan && (
                <Button onClick={() => onManageOrphan(conflict.username!)}>查看失效账号</Button>
              )}
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {assigning && plans.isError && <Alert type="error" title={String(plans.error)} />}
      {assigning && plans.isSuccess && !plans.data.some((p) => p.enabled) && (
        <Alert type="info" title="请先在“订阅套餐”页面创建并启用套餐。" />
      )}
      <FormProvider {...form}>
        <Form layout="vertical" disabled={saving} onFinish={() => void form.handleSubmit(save)()}>
          {!assigning && (
            <>
              <FormField
                name="username"
                label="登录账号"
                onAfterChange={() => {
                  setConflict(null);
                  setError('');
                }}
              >
                <Input autoComplete="off" maxLength={120} placeholder="请输入新的登录账号" />
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
