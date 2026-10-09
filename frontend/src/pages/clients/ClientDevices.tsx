import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Space, Spin, Switch, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  ClientDeviceReportSchema,
  type ClientConnection,
  type ClientNodeTraffic,
} from '@/generated/zod';
import { HttpUtil, IntlUtil, SizeFormatter } from '@/utils';
import { useDatepicker } from '@/hooks/useDatepicker';
import DeviceBindingTable from '@/components/clients/DeviceBindingTable';
import './ClientDevices.css';

export default function ClientDevices({ email }: { email: string }) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const { datepicker } = useDatepicker();
  const [live, setLive] = useState(true);
  const label = (key: string) => t(`pages.clients.devices.${key}`);
  const date = (timestamp: number) =>
    timestamp > 0 ? IntlUtil.formatDate(timestamp, datepicker) : '—';
  const query = useQuery({
    queryKey: ['client-devices', email],
    queryFn: async () => {
      const result = await HttpUtil.get(
        `/panel/api/clients/devices/${encodeURIComponent(email)}`,
        undefined,
        { silent: true },
      );
      if (!result.success) throw new Error(result.msg || label('loadFailed'));
      return ClientDeviceReportSchema.parse(result.obj);
    },
    staleTime: 10_000,
    refetchInterval: live ? 15_000 : false,
    retry: false,
  });
  const data = query.isError ? undefined : query.data;
  const status = data?.connections.status;
  const onlineSources =
    status === 'ready'
      ? data?.connections.onlineSourceCount
      : status === 'partial'
        ? t('pages.clients.devices.atLeast', { count: data?.connections.onlineSourceCount })
        : label('unknown');

  const unbind = async (id: number) => {
    const result = await HttpUtil.delete(
      `/panel/api/clients/hwids/${encodeURIComponent(email)}/${id}`,
      { silent: true },
    );
    if (!result.success) throw new Error(result.msg || label('unbindFailed'));
    await cache.invalidateQueries({ queryKey: ['client-devices', email] });
  };
  const connectionColumns = [
    {
      title: label('connectionUser'),
      key: 'user',
      render: () => <span className="client-devices-wrap">{email}</span>,
    },
    {
      title: label('sourceIP'),
      dataIndex: 'ip',
      key: 'ip',
      render: (ip: string) => <span className="client-devices-wrap">{ip}</span>,
    },
    { title: label('node'), dataIndex: 'nodeName', key: 'nodeName' },
    {
      title: label('connectionStatus'),
      key: 'status',
      render: () => <Tag color="green">{label('onlineUnidentified')}</Tag>,
    },
    { title: label('lastActivity'), dataIndex: 'lastSeen', key: 'lastSeen', render: date },
  ];
  const trafficColumns = [
    {
      title: label('node'),
      key: 'node',
      render: (_: unknown, entry: ClientNodeTraffic) =>
        entry.nodeId === 0
          ? label('localNode')
          : entry.nodeName || t('pages.clients.devices.nodeFallback', { id: entry.nodeId }),
    },
    { title: label('outbound'), dataIndex: 'up', key: 'up', render: SizeFormatter.sizeFormat },
    { title: label('inbound'), dataIndex: 'down', key: 'down', render: SizeFormatter.sizeFormat },
    {
      title: label('trafficTotal'),
      dataIndex: 'total',
      key: 'total',
      render: SizeFormatter.sizeFormat,
    },
    { title: label('trafficStarted'), dataIndex: 'startedAt', key: 'startedAt', render: date },
    { title: label('trafficUpdated'), dataIndex: 'updatedAt', key: 'updatedAt', render: date },
  ];

  return (
    <section className="client-devices">
      <div className="client-devices-toolbar">
        <Typography.Text strong>{email}</Typography.Text>
        <Space wrap>
          <Space>
            <span>{label('autoRefresh')}</span>
            <Switch aria-label={label('autoRefresh')} checked={live} onChange={setLive} />
          </Space>
          <Button
            icon={<ReloadOutlined />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('refresh')}
          </Button>
        </Space>
      </div>
      {query.isPending && <Spin aria-label={label('loading')} />}
      {query.isError && (
        <Alert
          type="error"
          showIcon
          title={label('loadFailed')}
          description={query.error.message}
        />
      )}
      {data && (
        <>
          <div className="client-devices-summary">
            <div>
              <Typography.Text type="secondary">{label('registered')}</Typography.Text>
              <strong>{data.registered}</strong>
              <Typography.Text type="secondary">
                {data.limit > 0
                  ? t('pages.clients.devices.limit', { count: data.limit })
                  : label('unlimited')}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">{label('onlineSources')}</Typography.Text>
              <strong>{onlineSources}</strong>
              <Typography.Text type="secondary">{label('notDeviceCount')}</Typography.Text>
            </div>
          </div>
          <Typography.Title level={5}>{label('onlineConnections')}</Typography.Title>
          <Typography.Text type="secondary">{label('connectionIPNote')}</Typography.Text>
          {status !== 'ready' && (
            <Alert
              type="warning"
              showIcon
              title={status === 'partial' ? label('partial') : label('unavailable')}
              description={label('unavailableNote')}
            />
          )}
          <Space wrap>
            {data.connections.sources.map((source) => (
              <Tag key={source.nodeId} color={source.status === 'ready' ? 'green' : 'orange'}>
                {source.name} ·{' '}
                {source.status === 'ready' ? label('collected') : label('notCollected')}
              </Tag>
            ))}
          </Space>
          <Table<ClientConnection>
            size="small"
            rowKey={(entry, index) => `${entry.nodeId}:${index}`}
            columns={connectionColumns}
            dataSource={data.connections.connections}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 950 }}
            locale={{
              emptyText: status === 'ready' ? label('noOnlineSources') : label('unknown'),
            }}
          />
          <Typography.Text type="secondary">
            {label('collectedAt')}: {date(data.connections.generatedAt)}
          </Typography.Text>
          <Typography.Title level={5}>{label('trafficTitle')}</Typography.Title>
          <Typography.Text type="secondary">{label('trafficNote')}</Typography.Text>
          <div className="client-devices-summary client-devices-traffic-summary">
            {(['up', 'down', 'total'] as const).map((direction, index) => (
              <div key={direction}>
                <Typography.Text type="secondary">
                  {label(['outbound', 'inbound', 'trafficTotal'][index])}
                </Typography.Text>
                <strong>
                  {data.traffic.recorded
                    ? SizeFormatter.sizeFormat(data.traffic[direction])
                    : label('unknown')}
                </strong>
              </div>
            ))}
          </div>
          {data.traffic.recorded && (
            <Typography.Text type="secondary">
              {label('trafficStarted')}: {date(data.traffic.startedAt)} · {label('trafficUpdated')}:{' '}
              {date(data.traffic.updatedAt)}
            </Typography.Text>
          )}
          <Table<ClientNodeTraffic>
            size="small"
            rowKey="nodeId"
            columns={trafficColumns}
            dataSource={data.traffic.nodes}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 900 }}
            locale={{ emptyText: label('noTraffic') }}
          />
          <Alert
            type="info"
            showIcon
            title={label('countNote')}
            description={label('identityNote')}
          />
          <Typography.Title level={5}>{label('identifiedDevices')}</Typography.Title>
          {data.limit > 0 && data.registered >= data.limit && (
            <Alert type="warning" showIcon title={label('slotsFull')} />
          )}
          <Typography.Text type="secondary">{label('ipNote')}</Typography.Text>
          <DeviceBindingTable devices={data.devices} onUnbind={unbind} datepicker={datepicker} />
        </>
      )}
    </section>
  );
}
