import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useResetSubscription } from './useResetSubscription';

export default function ResetSubscriptionButton({
  email,
  onReset,
}: {
  email?: string;
  onReset?: () => void | Promise<void>;
}) {
  const { pending, confirmReset, modalContext, messageContext } = useResetSubscription({
    email,
    onReset,
  });
  return (
    <>
      {modalContext}
      {messageContext}
      <Button
        aria-label="重置订阅链接"
        className="subscription-reset-button"
        icon={<ReloadOutlined />}
        danger
        loading={pending}
        onClick={confirmReset}
      >
        重置订阅链接
      </Button>
    </>
  );
}
