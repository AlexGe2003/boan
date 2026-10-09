import { Button } from 'antd';
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
      <Button size="small" danger loading={pending} onClick={confirmReset}>
        重置订阅链接
      </Button>
    </>
  );
}
