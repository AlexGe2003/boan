import { FormProvider } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Form, InputNumber, Modal, Select } from 'antd';
import { FormField, useZodForm } from '@/components/form/rhf';
import {
  UsageControlFormSchema,
  type UsageControlTarget,
  type UsageControlFormValues,
} from '@/schemas/server-usage-control';
import { HttpUtil } from '@/utils';

const GB = 1073741824;

export default function UsageControlModal({
  target,
  onClose,
}: {
  target: UsageControlTarget;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useZodForm(UsageControlFormSchema, {
    defaultValues: {
      quotaGB: target.quota / GB,
      basis: target.basis === 'billing' ? ('billing' as const) : ('proxy' as const),
      adjustUsage: false,
      usedGB: target.used / GB,
    },
  });
  const mutation = useMutation({
    mutationFn: async (value: UsageControlFormValues) => {
      const validated = UsageControlFormSchema.parse(value);
      const result = await HttpUtil.post(
        '/panel/api/nodes/usage/control',
        {
          nodeId: target.nodeId,
          email: target.email || '',
          quota: Math.round(validated.quotaGB * GB),
          basis: validated.basis,
          adjustUsage: validated.adjustUsage,
          used: Math.round(validated.usedGB * GB),
        },
        { headers: { 'Content-Type': 'application/json' }, silent: true },
      );
      if (!result.success) throw new Error(result.msg || '流量设置保存失败');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['server-client-usage'] });
      onClose();
    },
  });
  const adjust = form.watch('adjustUsage');
  return (
    <Modal
      open
      title={`${target.name} · 流量设置`}
      okText="保存设置"
      cancelText="取消"
      onCancel={() => !mutation.isPending && onClose()}
      onOk={() => void form.handleSubmit((value) => mutation.mutate(value))()}
      confirmLoading={mutation.isPending}
    >
      <Alert
        type="info"
        showIcon
        title="手动额度与统计校正"
        description="额度仅用于剩余量与超额提醒，不会自动断流或修改套餐扣量。额度为累计值，不自动按月清零。实际采集记录保留，校正后新流量继续累加。"
        style={{ marginBottom: 16 }}
      />
      {mutation.isError && (
        <Alert
          type="error"
          title="保存失败"
          description={String(mutation.error)}
          style={{ marginBottom: 16 }}
        />
      )}
      <FormProvider {...form}>
        <Form layout="vertical" disabled={mutation.isPending}>
          <FormField
            name="quotaGB"
            label={target.email ? '此用户在该节点的额度（GB）' : '此节点总额度（GB）'}
            extra="0 表示不设置额度。1 GB = 1024³ 字节。"
          >
            <InputNumber min={0} max={1000000} style={{ width: '100%' }} />
          </FormField>
          <FormField name="basis" label="额度统计口径">
            <Select
              options={[
                { value: 'proxy', label: '统计用量（上传＋下载＋手动校正）' },
                { value: 'billing', label: '计费流量估算（包含节点计费倍率）' },
              ]}
            />
          </FormField>
          <FormField name="adjustUsage" valueProp="checked">
            <Checkbox>同时校正已用量</Checkbox>
          </FormField>
          {adjust && (
            <>
              <FormField
                name="usedGB"
                label="校正后的统计已用量（GB）"
                extra={
                  target.email
                    ? '此设置仅影响该用户在这台节点的统计。'
                    : '节点总量不能低于已归属用户的统计合计；额外部分显示为未归属手动量。'
                }
              >
                <InputNumber min={0} max={1000000} style={{ width: '100%' }} />
              </FormField>
              <Button onClick={() => form.setValue('usedGB', target.restoreUsed / GB)}>
                {target.email ? '恢复实际采集值' : '清除节点额外手动量'}
              </Button>
            </>
          )}
        </Form>
      </FormProvider>
    </Modal>
  );
}
