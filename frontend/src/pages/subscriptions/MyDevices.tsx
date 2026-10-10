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
import { HttpUtil, IntlUtil } from '@/utils';
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
  const sourceCount = report && report.status !== 'unavailable' ? report.onlineSourceCount : null;
  const ipLimit = data?.onlineIpLimit ?? 0;
  const sourceText =
    sourceCount === null ? '—' : `${report?.status === 'partial' ? '≥ ' : ''}${sourceCount}`;
  return (
    <section className="client-devices customer-devices">
      <div className="client-devices-toolbar">
        <div>
          <Typography.Title level={4}>连接概览</Typography.Title>
          <p className="device-muted">查看在线来源与订阅客户端</p>
        </div>
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
                  <GlobalOutlined /> 同时在线来源
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
                      ? '待获取'
                      : sourceCount === 0
                        ? '暂无连接'
                        : sourceCount > ipLimit
                          ? '超过上限'
                          : report?.status === 'partial'
                            ? '数据不完整'
                            : '连接正常'}
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
                <p className="device-muted">最多 {ipLimit} 个来源 IP 同时使用订阅</p>
              </section>
              <section className="device-panel device-client-panel">
                <div className="device-eyebrow">
                  <AppstoreOutlined /> 订阅客户端
                </div>
                <SubscriptionClientSummary client={data.subscriptionClient} customerView />
                {!data.subscriptionClient && onSubscription && (
                  <Button type="link" onClick={onSubscription}>
                    前往订阅 <RightOutlined />
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
          {ipLimit === 0 && (
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
            <h3>
              {label('onlineSources')} ·{' '}
              {sourceCount === null
                ? '未知'
                : `${report?.status === 'partial' ? '至少 ' : ''}${sourceCount} 个`}
            </h3>
            <p className="device-muted">当前账号在各节点上的连接记录</p>
          </div>
          {report && (
            <span className="device-collected">
              {label('collectedAt')}: {IntlUtil.formatDate(report.generatedAt)}
            </span>
          )}
        </div>
        {connections.isPending && <Skeleton active title={false} paragraph={{ rows: 2 }} />}
        {(connections.isError || (report?.status !== 'ready' && !connections.isPending)) && (
          <Alert
            type="warning"
            showIcon
            title="在线来源采集不完整"
            description="部分节点暂未返回数据，可稍后刷新重试。"
          />
        )}
        {report && (
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
                    <Tag color="green">在线</Tag>
                  </div>
                  <div className="device-source-meta">
                    <span>{label('currentAccount')}</span>
                    <span>
                      <ClusterOutlined /> {label('node')}: {entry.nodeName}
                    </span>
                  </div>
                </div>
                <div className="device-source-time">
                  <span>{label('lastActivity')}</span>
                  <time>
                    {entry.lastSeen > 0 ? IntlUtil.formatDate(entry.lastSeen) : label('unknown')}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
        {report?.status === 'ready' && report.connections.length === 0 && (
          <div className="device-offline-empty">
            <GlobalOutlined />
            <h4>暂无在线来源</h4>
            <p>在客户端连接节点后，在线来源会显示在这里。</p>
            {onSubscription && <Button onClick={onSubscription}>获取订阅</Button>}
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
