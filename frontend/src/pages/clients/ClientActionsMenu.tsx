import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  MoreOutlined,
  QrcodeOutlined,
  RetweetOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useResetSubscription } from '../subscriptions/useResetSubscription';

interface ClientActionsMenuProps {
  email: string;
  onAccount?: (email: string) => void;
  onSubscriptionReset?: () => void | Promise<void>;
  onShowQr?: (email: string) => void;
  onResetTraffic?: (email: string) => void;
  onEdit?: (email: string) => void;
  onDelete?: (email: string) => void;
}

export default function ClientActionsMenu({
  email,
  onAccount,
  onSubscriptionReset,
  onShowQr,
  onResetTraffic,
  onEdit,
  onDelete,
}: ClientActionsMenuProps) {
  const { t } = useTranslation();
  const { pending, confirmReset, modalContext, messageContext } = useResetSubscription({
    email,
    onReset: onSubscriptionReset,
  });
  const items: MenuProps['items'] = [];
  if (onAccount)
    items.push({
      key: 'account',
      icon: <UserOutlined />,
      label: '管理登录账号',
      onClick: () => onAccount(email),
    });
  if (onShowQr)
    items.push({
      key: 'qr',
      icon: <QrcodeOutlined />,
      label: t('pages.clients.qrCode'),
      onClick: () => onShowQr(email),
    });
  if (onEdit)
    items.push({
      key: 'edit',
      icon: <EditOutlined />,
      label: t('edit'),
      onClick: () => onEdit(email),
    });
  if (items.length > 0 && (onResetTraffic || onSubscriptionReset || onDelete))
    items.push({ type: 'divider' });
  if (onResetTraffic)
    items.push({
      key: 'resetTraffic',
      icon: <RetweetOutlined />,
      label: t('pages.inbounds.resetTraffic'),
      onClick: () => onResetTraffic(email),
    });
  if (onSubscriptionReset)
    items.push({
      key: 'resetSubscription',
      icon: <LinkOutlined />,
      label: '重置订阅链接',
      danger: true,
      disabled: pending,
      onClick: confirmReset,
    });
  if (onDelete)
    items.push({
      key: 'delete',
      icon: <DeleteOutlined />,
      label: t('delete'),
      danger: true,
      onClick: () => onDelete(email),
    });
  return (
    <>
      {modalContext}
      {messageContext}
      <Dropdown trigger={['click']} placement="bottomRight" menu={{ items }}>
        <Button
          type="text"
          size="small"
          className="row-action-trigger"
          icon={<MoreOutlined />}
          aria-label={t('more')}
        />
      </Dropdown>
    </>
  );
}
