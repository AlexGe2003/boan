import { FormProvider, useWatch } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { z } from 'zod';
import { NodeGroupBuyItemSchema } from '@/generated/zod';
import { NodeGroupBuyFormSchema, type NodeGroupBuyFormValues } from '@/schemas/node-group-buy';
import { FormField, useZodForm } from '@/components/form/rhf';
import { HttpUtil } from '@/utils';
import { groupBuyMoney, groupBuyQuote } from './groupBuyPricing';

export default function NodeGroupBuyModal({
  item,
  onClose,
}: {
  item: z.infer<typeof NodeGroupBuyItemSchema>;
  onClose: () => void;
}) {
  const config = item.config;
  const defaults: NodeGroupBuyFormValues = {
    groupName: config.groupName,
    provider: config.provider,
    region: config.region,
    monthlyPrice: config.monthlyPrice / 100,
    expiresAt: config.expiresAt,
    bandwidthMbps: config.bandwidthMbps,
    bandwidthMode: config.bandwidthMode === 'dedicated' ? 'dedicated' : 'shared',
    trafficGB: config.monthlyTraffic / 1073741824,
    memberCount: config.memberCount,
    feeMode: config.feeMode === 'percent' ? 'percent' : 'fixed',
    feeValue: config.feeValue / 100,
    notes: config.notes,
  };
  const form = useZodForm(NodeGroupBuyFormSchema, { defaultValues: defaults });
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (v: NodeGroupBuyFormValues) => {
      const result = await HttpUtil.post(
        '/panel/api/nodes/group-buy',
        {
          nodeId: item.nodeId,
          groupName: v.groupName,
          provider: v.provider,
          region: v.region,
          monthlyPrice: Math.round(v.monthlyPrice * 100),
          expiresAt: v.expiresAt,
          bandwidthMbps: v.bandwidthMbps,
          bandwidthMode: v.bandwidthMode,
          monthlyTraffic: Math.round(v.trafficGB * 1073741824),
          memberCount: v.memberCount,
          feeMode: v.feeMode,
          feeValue: Math.round(v.feeValue * 100),
          notes: v.notes,
        },
        { headers: { 'Content-Type': 'application/json' }, silent: true },
      );
      if (!result.success) throw new Error(result.msg || '配置保存失败');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['node-group-buy'] });
      onClose();
    },
  });
  const [monthlyPrice, feeMode, feeValue, memberCount] = useWatch({
    control: form.control,
    name: ['monthlyPrice', 'feeMode', 'feeValue', 'memberCount'],
  });
  const quote = groupBuyQuote(monthlyPrice, feeMode, feeValue, memberCount);
  return (
    <Modal
      open
      width={640}
      centered
      rootClassName="group-buy-modal"
      title={`${item.name} · 拼团配置`}
      okText="保存配置"
      cancelText="取消"
      confirmLoading={save.isPending}
      onCancel={() => !save.isPending && onClose()}
      onOk={() => void form.handleSubmit((v) => save.mutate(v))()}
    >
      <Alert
        type="info"
        showIcon
        title="节点成本与拼团报价"
        description="成员分摊节点月租和整团手续费。金额为预计报价，实际收款另行记录。"
        style={{ marginBottom: 16 }}
      />
      <section
        className="group-buy-quote"
        aria-label="实时月费预览"
        aria-live="polite"
        aria-atomic="true"
      >
        <div>
          <span>节点月成本</span>
          <strong>{quote ? groupBuyMoney(quote.cost) : '—'}</strong>
        </div>
        <div>
          <span>你的月手续费</span>
          <strong>{quote ? groupBuyMoney(quote.fee) : '—'}</strong>
        </div>
        <div>
          <span>整团月报价</span>
          <strong>{quote ? groupBuyMoney(quote.total) : '—'}</strong>
        </div>
        <div>
          <span>每人参考月费</span>
          <strong>
            {quote?.perMember != null ? groupBuyMoney(quote.perMember) : '待设置人数'}
          </strong>
        </div>
        <p>{quote ? '参考月费按分向上取整，保存后生效。' : '请填写有效的月租、手续费和人数。'}</p>
      </section>
      {save.isError && <Alert type="error" title="保存失败" description={String(save.error)} />}
      <FormProvider {...form}>
        <Form layout="vertical" disabled={save.isPending}>
          <div className="group-buy-form-grid">
            <FormField name="groupName" label="拼团名称">
              <Input placeholder="例如：香港中转＋美国落地" />
            </FormField>
            <FormField name="provider" label="供应商">
              <Input />
            </FormField>
            <FormField name="region" label="区域 / 用途">
              <Input placeholder="香港中转 / 美国落地" />
            </FormField>
            <FormField name="monthlyPrice" label="节点月租（元 / 月）">
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </FormField>
            <FormField
              name="expiresAt"
              label="节点到期时间"
              transform={{
                input: (v) => (typeof v === 'number' && v > 0 ? dayjs(v) : null),
                output: (v) => (dayjs.isDayjs(v) ? v.valueOf() : 0),
              }}
            >
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
            </FormField>
            <FormField name="memberCount" label="计划拼团人数" extra="0 表示暂不计算人均价格。">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </FormField>
            <FormField name="bandwidthMbps" label="带宽（Mbps）" extra="资料值，0 表示未设置。">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </FormField>
            <FormField name="bandwidthMode" label="带宽类型">
              <Select
                options={[
                  { value: 'shared', label: '共享带宽' },
                  { value: 'dedicated', label: '独享带宽' },
                ]}
              />
            </FormField>
            <FormField
              name="trafficGB"
              label="供应商每月流量额度（GB）"
              extra="资源资料，不与累计统计混作本月已用量。"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </FormField>
            <FormField name="feeMode" label="手续费方式">
              <Select
                options={[
                  { value: 'fixed', label: '固定月手续费' },
                  { value: 'percent', label: '按节点月租比例' },
                ]}
              />
            </FormField>
            <FormField
              name="feeValue"
              label={feeMode === 'percent' ? '月租手续费比例（%）' : '整团月手续费（元）'}
            >
              <InputNumber
                min={0}
                max={feeMode === 'percent' ? 100 : 10000000}
                precision={2}
                style={{ width: '100%' }}
              />
            </FormField>
          </div>
          <FormField name="notes" label="备注">
            <Input.TextArea rows={3} maxLength={1000} />
          </FormField>
        </Form>
      </FormProvider>
    </Modal>
  );
}
