import { useState } from 'react';
import { Modal, message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { HttpUtil } from '@/utils';

export function useResetSubscription({
  email,
  onReset,
}: {
  email?: string;
  onReset?: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [modal, modalContext] = Modal.useModal();
  const [messages, messageContext] = message.useMessage();
  const queryClient = useQueryClient();
  const confirmReset = () => {
    if (pending) return;
    modal.confirm({
      title: '重置订阅链接',
      content: `${email ? `用户：${email}。` : ''}重置后旧订阅链接将失效，请复制新链接并重新导入客户端。流量和有效期保持不变，已导入的节点仍可能继续连接。`,
      okText: '确认重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setPending(true);
        try {
          const result = await HttpUtil.post(
            email
              ? `/panel/api/clients/resetSubscription/${encodeURIComponent(email)}`
              : '/panel/api/clients/resetMySubscription',
            undefined,
            { silent: true },
          );
          if (!result.success) throw new Error(result.msg || '重置失败，请重试');
          await queryClient.invalidateQueries({ queryKey: ['clients'] });
          await onReset?.();
          messages.success('订阅链接已重置，请使用新链接重新导入客户端');
        } catch (error) {
          messages.error(error instanceof Error ? error.message : '重置失败，请重试');
          throw error;
        } finally {
          setPending(false);
        }
      },
    });
  };
  return { pending, confirmReset, modalContext, messageContext };
}
