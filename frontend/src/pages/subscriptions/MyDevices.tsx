import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Skeleton, Typography, Tag } from 'antd';
import {
  LaptopOutlined,
  ReloadOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  ClusterOutlined,
  AppstoreOutlined,
  RightOutlined,
} from '@ant-design/icons';
import DeviceBindingTable from '@/components/clients/DeviceBindingTable';
import SubscriptionClientSummary from '@/components/clients/SubscriptionClientSummary';
import { ClientDeviceSlotsSchema, ClientConnectionReportSchema } from '@/generated/zod';
import { HttpUtil } from '@/utils';
import '@/pages/clients/ClientDevices.css';
import './CustomerUsage.css';
import './MyDevices.css';

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
  const report = connections.isError ? undefined : connections.data;
  const sourceCount =
    report &&
    (report.status === 'ready' || (report.status === 'partial' && report.onlineSourceCount > 0))
      ? report.onlineSourceCount
      : null;
  const ipLimit = data?.onlineIpLimit ?? 0;
  const hasOnlineConnections = sourceCount !== null && sourceCount > 0;
  const sourceText =
    sourceCount === null ? '—' : `${report?.status === 'partial' ? '≥ ' : ''}${sourceCount}`;
  return (
    <section className="client-devices customer-devices">
      <div className="client-devices-toolbar">
        <p className="device-muted">{label('connectionAutoRefresh')}</p>
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
      {query.isPending && (
        <Skeleton active title={false} paragraph={{ rows: 3 }} aria-label={label('loading')} />
      )}
      {query.isError && (
        <Alert type="error" title={label('loadFailed')} description={query.error.message} />
      )}
      {data && (
        <>
          {(data.onlineIpLimit ?? 0) > 0 ? (
            <div className="device-overview-grid">
              <section className="device-panel device-capacity">
                <div className="device-eyebrow">
                  <GlobalOutlined /> {label('connectionStatus')}
                </div>
                <div className="device-capacity-value">
                  <strong>{sourceText}</strong>
                  <span>/ {ipLimit}</span>
                  <Tag
                    color={
                      sourceCount === null || sourceCount === 0
                        ? undefined
                        : report?.status === 'partial' || sourceCount > ipLimit
                          ? 'orange'
                          : 'green'
                    }
                  >
                    {sourceCount === null
                      ? label('waitingForData')
                      : sourceCount === 0
                        ? label('offline')
                        : sourceCount > ipLimit
                          ? label('overLimit')
                          : report?.status === 'partial'
                            ? label('incomplete')
                            : label('connected')}
                  </Tag>
                </div>
                <div className="device-capacity-track" aria-hidden="true">
                  {Array.from({ length: Math.min(ipLimit, 12) }, (_, i) => (
                    <span
                      key={i}
                      className={sourceCount !== null && i < sourceCount ? 'is-used' : undefined}
                    />
                  ))}
                </div>
                <p className="device-muted">
                  {t('pages.clients.devices.simultaneousSources', { count: ipLimit })}
                </p>
              </section>
              <section className="device-panel device-client-panel">
                <div className="device-eyebrow">
                  <AppstoreOutlined /> {label('clientSoftware')}
                </div>
                {hasOnlineConnections ? (
                  <>
                    <SubscriptionClientSummary client={data.subscriptionClient} customerView />
                    <p className="device-muted">{label('clientSoftwareHint')}</p>
                  </>
                ) : (
                  <div className="device-client-empty">
                    <LaptopOutlined />
                    <strong>
                      {label(sourceCount === null ? 'waitingForConnections' : 'noConnectedDevices')}
                    </strong>
                  </div>
                )}
                {hasOnlineConnections && !data.subscriptionClient?.name && onSubscription && (
                  <Button type="link" onClick={onSubscription}>
                    {label('goToSubscription')} <RightOutlined />
                  </Button>
                )}
              </section>
            </div>
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
          {ipLimit === 0 && hasOnlineConnections && (
            <SubscriptionClientSummary client={data.subscriptionClient} customerView />
          )}
          {(data.onlineIpLimit ?? 0) === 0 && data.limit > 0 && (
            <p className="customer-device-note">
              授权名额不等于真实设备数量；撤销授权只阻止后续订阅获取，已导入节点可能继续连接。
            </p>
          )}
        </>
      )}
      <section className="device-panel device-connections">
        <div className="device-section-heading">
          <div>
            <h3>{label('onlineConnections')}</h3>
            <p className="device-muted">{label('onlineConnectionsHint')}</p>
          </div>
          {sourceCount !== null && sourceCount > 0 && (
            <Tag>{t('pages.clients.devices.sourceCount', { count: sourceCount })}</Tag>
          )}
        </div>
        {connections.isPending && <Skeleton active title={false} paragraph={{ rows: 2 }} />}
        {(connections.isError || (report?.status !== 'ready' && !connections.isPending)) && (
          <Alert
            type="warning"
            showIcon
            title={label('incomplete')}
            description={label('incompleteHint')}
          />
        )}
        {report && report.connections.length > 0 && (
          <ul className="device-connection-list">
            {report.connections.map((entry, index) => (
              <li key={`${entry.nodeId}:${index}`}>
                <div className="device-source-icon">
                  <GlobalOutlined />
                </div>
                <div className="device-source-content">
                  <div className="device-source-title">
                    <strong>
                      {label('sourceIP')}: {entry.ip}
                    </strong>
                    <Tag color="green">{label('online')}</Tag>
                  </div>
                  <div className="device-source-meta">
                    <span>{label('currentAccount')}</span>
                    <span>
                      <ClusterOutlined /> {label('node')}: {entry.nodeName}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {report?.status === 'ready' && report.connections.length === 0 && (
          <div className="device-offline-empty">
            <GlobalOutlined />
            <h4>{label('noOnlineConnections')}</h4>
            <p>{label('noOnlineConnectionsHint')}</p>
            {onSubscription && (
              <Button onClick={onSubscription}>{label('goToSubscription')}</Button>
            )}
          </div>
        )}
      </section>
      <details className="device-rules">
        <summary>
          <SafetyCertificateOutlined />
          <span>连接与限制说明</span>
          <RightOutlined />
        </summary>
        <div>
          <p>
            在线来源按 IP 统计，不代表真实设备数量。同一网络下多台设备可能共用一个
            IP；经过中转时可能显示中转地址。
          </p>
          <p>切换网络后，旧来源约 2 分钟过期。超限来源会在扫描和同步后被阻止，并暂停约 1 分钟。</p>
          <p>订阅客户端根据最近的订阅请求识别，不代表当前连接的软件。</p>
        </div>
      </details>
    </section>
  );
}
