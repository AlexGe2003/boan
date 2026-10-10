import { useState } from 'react';
import { Modal, message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { HttpUtil } from '@/utils';
import { useTranslation } from 'react-i18next';

export function useResetSubscription({
  email,
  onReset,
  resetConnections = false,
}: {
  email?: string;
  onReset?: () => void | Promise<void>;
  resetConnections?: boolean;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [modal, modalContext] = Modal.useModal();
  const [messages, messageContext] = message.useMessage();
  const queryClient = useQueryClient();
  const confirmReset = () => {
    if (pending) return;
    modal.confirm({
      title: resetConnections ? t('pages.clients.devices.resetAccessConfirm') : '重置订阅链接？',
      centered: true,
      width: 420,
      content: resetConnections
        ? t('pages.clients.devices.resetAccessNote')
        : `${email ? `用户：${email}。` : ''}重置后旧订阅链接将失效，请复制新链接并重新导入客户端。流量和有效期保持不变，已导入的节点仍可能继续连接。`,
      okText: resetConnections ? t('confirm') : '确认重置',
      cancelText: resetConnections ? t('cancel') : '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setPending(true);
        try {
          const result = await HttpUtil.post(
            email
              ? `/panel/api/clients/resetSubscription/${encodeURIComponent(email)}`
              : '/panel/api/clients/resetMySubscription',
            resetConnections ? { resetConnections: true } : undefined,
            { silent: true },
          );
          if (!result.success) throw new Error(result.msg || '重置失败，请重试');
          await queryClient.invalidateQueries({ queryKey: ['clients'] });
          await onReset?.();
          messages.success(
            resetConnections
              ? t('pages.clients.devices.resetAccessSuccess')
              : '订阅链接已重置，请使用新链接重新导入客户端',
          );
        } catch (error) {
          messages.error(error instanceof Error ? error.message : '重置失败，请重试');
          throw error;
        } finally {
          if (resetConnections) {
            await queryClient.invalidateQueries({ queryKey: ['clients'] });
            await queryClient.invalidateQueries({ queryKey: ['my-devices'] });
            await queryClient.invalidateQueries({ queryKey: ['my-connections'] });
          }
          setPending(false);
        }
      },
    });
  };
  return { pending, confirmReset, modalContext, messageContext };
}
