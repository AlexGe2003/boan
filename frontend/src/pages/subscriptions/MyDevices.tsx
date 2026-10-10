import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Spin, Typography, Tag } from 'antd';
import { LaptopOutlined, ReloadOutlined } from '@ant-design/icons';
import DeviceBindingTable from '@/components/clients/DeviceBindingTable';
import SubscriptionClientSummary from '@/components/clients/SubscriptionClientSummary';
import { ClientDeviceSlotsSchema, ClientConnectionReportSchema } from '@/generated/zod';
import { HttpUtil, IntlUtil } from '@/utils';
import '@/pages/clients/ClientDevices.css';
import './CustomerUsage.css';

export default function MyDevices({
  userId,
  onSubscription,
}: {
  userId: number;
  onSubscription?: () => void;
}) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const label = (key: string) => t(`pages.clients.devices.${key}`);
  const query = useQuery({
    queryKey: ['my-devices', userId],
    enabled: userId > 0,
    queryFn: async () => {
      const result = await HttpUtil.get('/panel/api/clients/myDevices', undefined, {
        silent: true,
      });
      if (!result.success) throw new Error(result.msg || label('loadFailed'));
      return ClientDeviceSlotsSchema.parse(result.obj);
    },
    refetchInterval: 30_000,
    retry: false,
  });
  const connections = useQuery({
    queryKey: ['my-connections', userId],
    enabled: userId > 0,
    queryFn: async () => {
      const result = await HttpUtil.get('/panel/api/clients/myConnections', undefined, {
        silent: true,
      });
      if (!result.success) throw new Error(result.msg || '在线连接加载失败');
      return ClientConnectionReportSchema.parse(result.obj);
    },
    refetchInterval: 30000,
    retry: false,
  });
  const data = query.isError ? undefined : query.data;
  const unbind = async (id: number) => {
    const result = await HttpUtil.delete(`/panel/api/clients/myDevices/${id}`, {
      silent: true,
    });
    if (!result.success) throw new Error(result.msg || label('unbindFailed'));
    await cache.invalidateQueries({ queryKey: ['my-devices', userId] });
  };
  return (
    <section className="customer-card client-devices">
      <div className="client-devices-toolbar">
        <Typography.Title level={4}>{label('myDevices')}</Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          loading={query.isFetching || connections.isFetching}
          onClick={() => {
            void query.refetch();
            void connections.refetch();
          }}
        >
          {t('refresh')}
        </Button>
      </div>
      {query.isPending && <Spin aria-label={label('loading')} />}
      {query.isError && (
        <Alert type="error" title={label('loadFailed')} description={query.error.message} />
      )}
      {data && (
        <>
          {(data.onlineIpLimit ?? 0) > 0 ? (
            <Alert
              type="info"
              showIcon
              title={`同时在线 IP 上限：${data.onlineIpLimit} 个`}
              description="同一网络下多台设备可能共用一个 IP；切换网络后的旧来源约 2 分钟过期。超限来源会在扫描和同步后被阻止，并暂停约 1 分钟。"
            />
          ) : (
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
                  <Typography.Text type="secondary">{label('remaining')}</Typography.Text>
                  <strong>{data.limit > 0 ? data.remaining : label('unlimited')}</strong>
                </div>
              </div>
              {data.full && <Alert type="warning" showIcon title={label('slotsFull')} />}
              {data.devices.length === 0 ? (
                <div className="customer-device-empty">
                  <LaptopOutlined />
                  <h3>尚未绑定设备</h3>
                  <p>前往订阅页创建授权，生成独立的客户端订阅链接。</p>
                  {onSubscription && (
                    <Button type="primary" size="large" onClick={onSubscription}>
                      前往订阅
                    </Button>
                  )}
                </div>
              ) : (
                <DeviceBindingTable devices={data.devices} onUnbind={unbind} customerView />
              )}
            </>
          )}
          <SubscriptionClientSummary client={data.subscriptionClient} customerView />
          {(data.onlineIpLimit ?? 0) === 0 && data.limit > 0 && (
            <p className="customer-device-note">
              授权名额不等于真实设备数量；撤销授权只阻止后续订阅获取，已导入节点可能继续连接。
            </p>
          )}
        </>
      )}
      <section className="customer-online-sources">
        <h3>
          {label('onlineSources')} ·{' '}
          {connections.data && !connections.isError && connections.data.status !== 'unavailable'
            ? `${connections.data.status === 'partial' ? '至少 ' : ''}${connections.data.onlineSourceCount} 个`
            : '未知'}
        </h3>
        <p>节点实际看到的来源地址，与获取订阅的来源地址不同；经过中转时可能显示中转地址。</p>
        {connections.isPending && <Spin size="small" />}
        {(connections.isError ||
          (connections.data?.status !== 'ready' && !connections.isPending)) && (
          <Alert type="warning" title="在线来源采集不完整" />
        )}
        {!connections.isError && connections.data && (
          <ul className="customer-source-list">
            {connections.data.connections.map((entry, index) => (
              <li key={`${entry.nodeId}:${index}`}>
                <Tag color="green">在线</Tag>
                <span>{label('currentAccount')}</span>
                <span>
                  {label('sourceIP')}: {entry.ip}
                </span>
                <span>
                  {label('node')}: {entry.nodeName}
                </span>
                <time>
                  {label('lastActivity')}:{' '}
                  {entry.lastSeen > 0 ? IntlUtil.formatDate(entry.lastSeen) : label('unknown')}
                </time>
              </li>
            ))}
          </ul>
        )}
        {!connections.isError &&
          connections.data?.status === 'ready' &&
          connections.data.connections.length === 0 && <p>暂无在线来源</p>}
        {!connections.isError && connections.data && (
          <p>
            {label('collectedAt')}: {IntlUtil.formatDate(connections.data.generatedAt)}
          </p>
        )}
      </section>
    </section>
  );
}
