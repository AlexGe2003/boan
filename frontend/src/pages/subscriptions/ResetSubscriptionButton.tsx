import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useResetSubscription } from './useResetSubscription';
import { useTranslation } from 'react-i18next';

export default function ResetSubscriptionButton({
  email,
  onReset,
  resetConnections = false,
}: {
  email?: string;
  onReset?: () => void | Promise<void>;
  resetConnections?: boolean;
}) {
  const { t } = useTranslation();
  const text = resetConnections ? t('pages.clients.devices.resetAccess') : '重置订阅链接';
  const { pending, confirmReset, modalContext, messageContext } = useResetSubscription({
    email,
    onReset,
    resetConnections,
  });
  return (
    <>
      {modalContext}
      {messageContext}
      <Button
        aria-label={text}
        className="subscription-reset-button"
        icon={<ReloadOutlined />}
        danger
        loading={pending}
        onClick={confirmReset}
      >
        {text}
      </Button>
    </>
  );
}
