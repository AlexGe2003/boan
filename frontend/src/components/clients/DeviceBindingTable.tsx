import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Empty, Popconfirm, Table, Tooltip, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ClientHwidInfo } from '@/generated/zod';
import { IntlUtil } from '@/utils';

export default function DeviceBindingTable({
  devices,
  onUnbind,
  datepicker = 'gregorian',
  customerView = false,
}: {
  devices: ClientHwidInfo[];
  onUnbind: (id: number) => Promise<void>;
  datepicker?: 'gregorian' | 'jalalian';
  customerView?: boolean;
}) {
  const { t } = useTranslation();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const label = (key: string) => t(`pages.clients.devices.${key}`);
  const date = (timestamp: number) =>
    timestamp > 0 ? IntlUtil.formatDate(timestamp, datepicker) : '—';
  const mutation = useMutation({
    mutationFn: onUnbind,
    onMutate: (id) => setDeletingId(id),
    onSettled: () => setDeletingId(null),
  });
  const columns = [
    {
      title: label('device'),
      key: 'device',
      width: 180,
      render: (_: unknown, entry: ClientHwidInfo) => (
        <div>
          <Typography.Text strong>{entry.deviceModel || label('unnamed')}</Typography.Text>
          <div style={{ color: 'var(--ant-color-text-secondary)' }}>
            {[entry.deviceOs, entry.osVersion].filter(Boolean).join(' ') || label('unknown')}
          </div>
          {!customerView && (
            <Typography.Text type="secondary" code>
              {entry.fingerprint}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: label('subscriptionClient'),
      dataIndex: 'userAgent',
      key: 'client',
      width: 180,
      render: (value: string, entry: ClientHwidInfo) => (
        <Tooltip title={value || undefined}>
          <span style={{ overflowWrap: 'anywhere' }}>
            {[entry.clientName || label('unknownClient'), entry.clientVersion]
              .filter(Boolean)
              .join(' ')}
          </span>
        </Tooltip>
      ),
    },
    { title: label('firstRegistered'), dataIndex: 'firstSeen', width: 175, render: date },
    { title: label('lastFetch'), dataIndex: 'lastSeen', width: 175, render: date },
    {
      title: label('subscriptionIP'),
      dataIndex: 'lastIp',
      width: 155,
      render: (ip: string) => <span style={{ overflowWrap: 'anywhere' }}>{ip || '—'}</span>,
    },
    {
      title: t('pages.clients.actions'),
      key: 'actions',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, entry: ClientHwidInfo) => (
        <Popconfirm
          title={entry.authorization ? '撤销订阅授权？' : label('unbindConfirm')}
          description={
            entry.authorization
              ? '该授权链接将无法再次获取订阅；已导入节点仍可能继续连接。'
              : label('unbindNote')
          }
          onConfirm={() => mutation.mutate(entry.id)}
          okButtonProps={{ danger: true }}
          okText={entry.authorization ? '撤销' : label('unbind')}
          cancelText={t('cancel')}
        >
          <Button
            className="device-unbind"
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={mutation.isPending}
            loading={deletingId === entry.id}
            aria-label={`${entry.authorization ? '撤销' : label('unbind')} ${entry.deviceModel || entry.fingerprint}`}
          >
            {entry.authorization ? '撤销' : label('unbind')}
          </Button>
        </Popconfirm>
      ),
    },
  ];
  return (
    <>
      {mutation.isError && (
        <Alert type="error" title={label('unbindFailed')} description={mutation.error.message} />
      )}
      {mutation.isSuccess && <Alert type="success" title={label('unbound')} showIcon />}
      <Table<ClientHwidInfo>
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={devices}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: 965 }}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={label('noDevices')} />
          ),
        }}
      />
    </>
  );
}
