import { lazy, Suspense, useState } from 'react';
import {
  ReloadOutlined,
  UpOutlined,
  DownOutlined,
  CalendarOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Layout, Progress, Spin, Table, Tag, Typography, Modal } from 'antd';
import { useTranslation } from 'react-i18next';

import AppSidebar from '@/layouts/AppSidebar';
import { usePanelRole } from '@/api/queries/usePanelRole';
import { useTheme } from '@/hooks/useTheme';
import { HttpUtil } from '@/utils';
import './NodeMonitorPage.css';
import ClientVisitsButton from './ClientVisitsButton';
const ServerUsage = lazy(() => import('./ServerUsage'));

function ServerUsageButton({ nodeId }: { nodeId?: number }) {
  const role = usePanelRole();
  const [open, setOpen] = useState(false);
  if (role !== 'admin') return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {nodeId === undefined ? '服务器流量总览' : '用户流量排行'}
      </Button>
      <Modal
        open={open}
        title={nodeId === undefined ? '服务器流量总览' : '服务器用户流量排行'}
        width={1100}
        footer={null}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        {open && (
          <Suspense fallback={<Spin />}>
            <ServerUsage nodeId={nodeId} />
          </Suspense>
        )}
      </Modal>
    </>
  );
}

export interface MonitoredInbound {
  id: number;
  remark: string;
  protocol: string;
  port: number;
  enabled: boolean;
  up: number;
  down: number;
  used: number;
  total: number;
  remaining: number | null;
}

export interface CarrierProbe {
  name: string;
  latencyMs?: number;
  lossPct?: number;
}

export interface MonitoredNode {
  id: number;
  local?: boolean;
  metricsAvailable?: boolean;
  name: string;
  address: string;
  status: string;
  xrayState: string;
  lastHeartbeat: number;
  panelLatencyMs: number;
  cpuPct?: number;
  memPct?: number;
  uptimeSecs?: number;
  netUp?: number;
  netDown?: number;
  inbounds: MonitoredInbound[] | null;
  // Optional fields are used by the visual preview until monitoring has a data source.
  country?: string;
  costLabel?: string;
  loadAverage?: string;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  diskPct?: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
  carrierProbes?: CarrierProbe[];
}

const carrierNames = ['电信', '移动', '联通'];
const carrierColors = ['#fb7185', '#34d399', '#60a5fa'];

function formatBytes(value: number): string {
  if (value < 1024) return `${value.toFixed(0)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let index = -1;
  do {
    amount /= 1024;
    index += 1;
  } while (amount >= 1024 && index < units.length - 1);
  return `${amount.toFixed(2)} ${units[index]}`;
}

function Metric({
  label,
  value,
  detail,
  percent,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  percent?: number;
  accent?: boolean;
}) {
  return (
    <div className="node-monitor-metric">
      <div className="node-monitor-metric-line">
        <span>{label}</span>
        <strong className={accent ? 'is-accent' : undefined}>{value}</strong>
      </div>
      <Progress
        percent={Math.min(100, Math.max(0, percent ?? 0))}
        showInfo={false}
        size="small"
        strokeColor={accent ? '#16a36f' : '#32a57f'}
        trailColor="#d9e2e7"
      />
      <div className="node-monitor-metric-detail">{detail || '\u00a0'}</div>
    </div>
  );
}

function ManageNodesButton() {
  const { t } = useTranslation();
  const role = usePanelRole();
  if (role !== 'admin') return null;
  const basePath = (window.X_UI_BASE_PATH || '/').replace(/\/?$/, '/');
  return (
    <Button icon={<SettingOutlined />} href={`${basePath}panel/nodes`}>
      {t('nodeMonitor.manageNodes')}
    </Button>
  );
}

function NodeCard({ node, index }: { node: MonitoredNode; index: number }) {
  const { t, i18n } = useTranslation();
  const inbounds = node.inbounds || [];
  const used = inbounds.reduce((sum, inbound) => sum + inbound.used, 0);
  const quota = inbounds.reduce((sum, inbound) => sum + inbound.total, 0);
  const hasUnlimited = inbounds.some((inbound) => inbound.total <= 0);
  const up = inbounds.reduce((sum, inbound) => sum + inbound.up, 0);
  const down = inbounds.reduce((sum, inbound) => sum + inbound.down, 0);
  const online = node.status === 'online';
  const coreIssue = online && ['stop', 'error'].includes(node.xrayState);
  const statusText = coreIssue
    ? t(
        node.xrayState === 'stop'
          ? 'pages.nodes.statusValues.xrayStopped'
          : 'pages.nodes.statusValues.xrayError',
      )
    : t(`pages.nodes.statusValues.${node.status || 'unknown'}`);
  const probes = carrierNames.map(
    (name) => node.carrierProbes?.find((probe) => probe.name === name) || { name },
  );
  const validMetric = online && (!node.local || node.metricsAvailable === true);

  return (
    <article className="node-monitor-card" id={`monitor-node-${index}`}>
      <div className="node-monitor-card-head">
        <div className="node-monitor-card-title">
          <span
            className={`node-monitor-dot ${coreIssue ? 'warning' : online ? 'online' : 'offline'}`}
          />
          <strong>{node.local ? t('nodeMonitor.local') : node.name}</strong>
        </div>
        <ServerUsageButton nodeId={node.local ? 0 : node.id} />
        {node.country && <span className="node-monitor-country">{node.country}</span>}
      </div>
      <div className="node-monitor-meta">
        <span className="node-monitor-meta-pill">
          {validMetric && node.uptimeSecs !== undefined && !coreIssue
            ? t('nodeMonitor.uptimeDays', { count: Math.floor(node.uptimeSecs / 86400) })
            : statusText}
        </span>
        {node.costLabel && <span className="node-monitor-meta-pill">{node.costLabel}</span>}
      </div>

      {!online ? (
        <div className="node-monitor-offline-note">
          <strong>{t('nodeMonitor.offlineMetrics')}</strong>
          <span>
            {t('pages.nodes.lastHeartbeat')}：
            {node.lastHeartbeat > 0
              ? new Date(node.lastHeartbeat * 1000).toLocaleString(i18n.language)
              : t('pages.nodes.never')}
          </span>
        </div>
      ) : (
        <>
          <div className="node-monitor-metric-grid">
            <Metric
              label="CPU"
              value={validMetric && node.cpuPct !== undefined ? `${node.cpuPct.toFixed(1)}%` : '—'}
              percent={validMetric ? node.cpuPct : undefined}
              detail={node.loadAverage}
            />
            <Metric
              label={t('nodeMonitor.memory')}
              value={validMetric && node.memPct !== undefined ? `${node.memPct.toFixed(1)}%` : '—'}
              percent={validMetric ? node.memPct : undefined}
              detail={
                node.memoryUsedBytes !== undefined && node.memoryTotalBytes !== undefined
                  ? `${formatBytes(node.memoryUsedBytes)} / ${formatBytes(node.memoryTotalBytes)}`
                  : undefined
              }
            />
            {node.diskPct !== undefined ? (
              <Metric
                label={t('nodeMonitor.disk')}
                value={validMetric ? `${node.diskPct.toFixed(1)}%` : '—'}
                percent={validMetric ? node.diskPct : undefined}
                detail={
                  node.diskUsedBytes !== undefined && node.diskTotalBytes !== undefined
                    ? `${formatBytes(node.diskUsedBytes)} / ${formatBytes(node.diskTotalBytes)}`
                    : undefined
                }
              />
            ) : (
              <Metric
                label={t('nodeMonitor.panelLatency')}
                value={validMetric && node.panelLatencyMs > 0 ? `${node.panelLatencyMs} ms` : '—'}
                detail={t('nodeMonitor.panelLatencyDetail')}
              />
            )}
            <Metric
              label={t('nodeMonitor.traffic')}
              value={
                inbounds.length && !hasUnlimited && quota > 0
                  ? `${((used / quota) * 100).toFixed(1)}%`
                  : '—'
              }
              percent={
                inbounds.length && !hasUnlimited && quota > 0 ? (used / quota) * 100 : undefined
              }
              detail={
                inbounds.length
                  ? `${formatBytes(used)} / ${hasUnlimited || quota === 0 ? t('nodeMonitor.unlimited') : formatBytes(quota)}`
                  : undefined
              }
              accent
            />
          </div>

          <div className="node-monitor-quick-stats">
            <div>
              <span>
                <UpOutlined />{' '}
                {validMetric && node.netUp !== undefined ? `${formatBytes(node.netUp)}/s` : '—'}
              </span>
              <span>
                <DownOutlined />{' '}
                {validMetric && node.netDown !== undefined ? `${formatBytes(node.netDown)}/s` : '—'}
              </span>
            </div>
            <div>
              <span>
                <UpOutlined /> {inbounds.length ? formatBytes(up) : '—'}
              </span>
              <span>
                <DownOutlined /> {inbounds.length ? formatBytes(down) : '—'}
              </span>
            </div>
            <div>
              <span>
                <CalendarOutlined />{' '}
                {validMetric && node.uptimeSecs !== undefined
                  ? t('nodeMonitor.uptimeDays', { count: Math.floor(node.uptimeSecs / 86400) })
                  : '—'}
              </span>
              <span>
                {node.costLabel ||
                  (node.lastHeartbeat > 0
                    ? t('nodeMonitor.lastHeartbeatShort', {
                        time: new Date(node.lastHeartbeat * 1000).toLocaleTimeString(
                          i18n.language,
                          { hour: '2-digit', minute: '2-digit' },
                        ),
                      })
                    : '—')}
              </span>
            </div>
          </div>

          {node.carrierProbes?.length ? (
            <div className="node-monitor-probe-grid">
              <section className="node-monitor-probe-panel">
                <h3>{t('nodeMonitor.latency')}</h3>
                {probes.map((probe, probeIndex) => (
                  <div className="node-monitor-probe-row" key={probe.name}>
                    <div className="node-monitor-probe-line">
                      <span>
                        <i style={{ background: carrierColors[probeIndex] }} />
                        {t(`nodeMonitor.carrier${probeIndex}`)}
                      </span>
                      <strong>
                        {probe.latencyMs === undefined ? '—' : `${probe.latencyMs} ms`}
                      </strong>
                    </div>
                    <Progress
                      steps={18}
                      percent={
                        probe.latencyMs === undefined ? 0 : Math.max(8, 100 - probe.latencyMs / 4)
                      }
                      showInfo={false}
                      strokeColor={
                        probe.latencyMs !== undefined && probe.latencyMs > 150
                          ? '#e4c33a'
                          : '#6bdd56'
                      }
                      trailColor="#dfe7eb"
                    />
                  </div>
                ))}
              </section>
              <section className="node-monitor-probe-panel">
                <h3>{t('nodeMonitor.packetLoss')}</h3>
                {probes.map((probe, probeIndex) => (
                  <div className="node-monitor-probe-row" key={probe.name}>
                    <div className="node-monitor-probe-line">
                      <span>
                        <i style={{ background: carrierColors[probeIndex] }} />
                        {t(`nodeMonitor.carrier${probeIndex}`)}
                      </span>
                      <strong>
                        {probe.lossPct === undefined ? '—' : `${probe.lossPct.toFixed(1)}%`}
                      </strong>
                    </div>
                    <Progress
                      steps={18}
                      percent={probe.lossPct === undefined ? 0 : 100 - probe.lossPct}
                      showInfo={false}
                      strokeColor="#19a982"
                      trailColor="#dfe7eb"
                    />
                  </div>
                ))}
              </section>
            </div>
          ) : (
            <div className="node-monitor-probe-empty">
              <span>{t('nodeMonitor.carrierMonitoring')}</span>
              <strong>{t('nodeMonitor.probeNotConfigured')}</strong>
            </div>
          )}
        </>
      )}

      <details className="node-monitor-config">
        <summary>
          {t('nodeMonitor.config')} <span>{inbounds.length}</span>
        </summary>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 580 }}
          dataSource={inbounds}
          locale={{ emptyText: t('nodeMonitor.noConfig') }}
          columns={[
            { title: t('nodeMonitor.name'), dataIndex: 'remark' },
            { title: t('nodeMonitor.protocol'), dataIndex: 'protocol' },
            { title: t('nodeMonitor.port'), dataIndex: 'port' },
            {
              title: t('nodeMonitor.used'),
              dataIndex: 'used',
              render: (value: number) => formatBytes(value),
            },
            {
              title: t('nodeMonitor.remaining'),
              dataIndex: 'remaining',
              render: (value: number | null) =>
                value === null ? t('nodeMonitor.unlimited') : formatBytes(value),
            },
            {
              title: t('nodeMonitor.status'),
              dataIndex: 'enabled',
              render: (value: boolean) => (
                <Tag color={value ? 'success' : 'default'}>
                  {value ? t('nodeMonitor.enabled') : t('nodeMonitor.disabled')}
                </Tag>
              ),
            },
          ]}
        />
      </details>
      <div className="node-monitor-card-foot">
        {node.address || t('nodeMonitor.local')}
        {online && (
          <>
            {' '}
            ·{' '}
            {node.lastHeartbeat > 0
              ? new Date(node.lastHeartbeat * 1000).toLocaleString(i18n.language)
              : t('pages.nodes.never')}
          </>
        )}
      </div>
    </article>
  );
}

export default function NodeMonitorPage({ mockData }: { mockData?: MonitoredNode[] }) {
  const { t, i18n } = useTranslation();
  const { isDark, isUltra } = useTheme();
  const query = useQuery({
    queryKey: ['nodes', 'monitor'],
    queryFn: async () => {
      const response = await HttpUtil.get<MonitoredNode[]>('/panel/api/nodes/monitor', undefined, {
        silent: true,
      });
      if (!response.success) throw new Error(response.msg || 'Could not load node monitoring');
      return response.obj || [];
    },
    refetchInterval: 30_000,
    retry: 1,
    enabled: !mockData,
    initialData: mockData,
  });
  const nodes = query.data || [];
  const onlineCount = nodes.filter((node) => node.status === 'online').length;
  const issueCount = nodes.filter(
    (node) => node.status === 'online' && ['error', 'stop'].includes(node.xrayState),
  ).length;

  return (
    <Layout
      className={`nodes-page node-monitor-page${isDark ? ' is-dark' : ''}${isUltra ? ' is-ultra' : ''}`}
    >
      {!mockData && <AppSidebar />}
      <Layout className="content-shell">
        <Layout.Content className="content-area">
          <div className="node-monitor-header">
            <div>
              <Typography.Title level={2}>
                {t('nodeMonitor.title')}
                {mockData && <Tag color="blue">Mock</Tag>}
              </Typography.Title>
              <Typography.Text type="secondary">
                {t('nodeMonitor.panelLatencyHint')}
              </Typography.Text>
            </div>
            {!mockData && (
              <div className="node-monitor-header-actions">
                <ManageNodesButton />
                <ServerUsageButton />
                <ClientVisitsButton />
                <Button
                  icon={<ReloadOutlined />}
                  loading={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  {t('refresh')}
                </Button>
              </div>
            )}
          </div>
          <details className="node-monitor-setup-help">
            <summary>{t('nodeMonitor.setupSummary')}</summary>
            <p>{t('nodeMonitor.setupGuide')}</p>
          </details>
          {query.isError && (
            <Alert
              className="node-monitor-alert"
              type="error"
              showIcon
              title={t('nodeMonitor.loadFailed')}
              description={query.error instanceof Error ? query.error.message : String(query.error)}
              action={
                <Button size="small" onClick={() => void query.refetch()}>
                  {t('refresh')}
                </Button>
              }
            />
          )}
          {query.isLoading && (
            <div className="node-monitor-loading">
              <Spin />
            </div>
          )}
          {query.data && (
            <>
              <div
                className="node-monitor-status-strip"
                aria-label={t('nodeMonitor.statusOverview')}
              >
                <div className="node-monitor-status-total">
                  <strong>
                    {onlineCount}
                    <span> / {nodes.length}</span>
                  </strong>
                  <small>{t('nodeMonitor.onlineNodes')}</small>
                </div>
                {nodes.map((node, index) => (
                  <button
                    key={`${node.id}:${node.name}`}
                    className="node-monitor-status-item"
                    onClick={() =>
                      document
                        .getElementById(`monitor-node-${index}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                  >
                    <span
                      className={`node-monitor-dot ${node.status !== 'online' ? 'offline' : ['error', 'stop'].includes(node.xrayState) ? 'warning' : 'online'}`}
                    />
                    <span className="node-monitor-status-name">
                      {node.local ? t('nodeMonitor.local') : node.name}
                    </span>
                    <small>
                      {node.status === 'online' && node.panelLatencyMs > 0
                        ? `${node.panelLatencyMs} ms`
                        : t(`pages.nodes.statusValues.${node.status || 'unknown'}`)}
                    </small>
                  </button>
                ))}
                {issueCount > 0 && (
                  <span className="node-monitor-status-warning">
                    {t('nodeMonitor.coreIssues')}: {issueCount}
                  </span>
                )}
              </div>
              <div className="node-monitor-updated">
                {t('nodeMonitor.updatedAt')}{' '}
                {new Date(query.dataUpdatedAt).toLocaleString(i18n.language)}
              </div>
              {nodes.length === 0 ? (
                <Empty description={t('nodeMonitor.noNodes')} />
              ) : (
                <div className="node-monitor-card-grid">
                  {nodes.map((node, index) => (
                    <NodeCard node={node} index={index} key={`${node.id}:${node.name}`} />
                  ))}
                </div>
              )}
            </>
          )}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
