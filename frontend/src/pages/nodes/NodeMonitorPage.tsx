import { lazy, Suspense, useState } from 'react';
import {
  ReloadOutlined,
  UpOutlined,
  DownOutlined,
  CalendarOutlined,
  SettingOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Empty,
  Layout,
  Progress,
  Spin,
  Tag,
  Typography,
  Modal,
  Input,
  Segmented,
  Skeleton,
} from 'antd';
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
        {nodeId === undefined ? '流量统计' : '用户用量'}
      </Button>
      <Modal
        open={open}
        title={nodeId === undefined ? '流量统计' : '用户用量'}
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
  target?: string;
  state?: string;
  samples?: number;
  lastChecked?: number;
  latencyMs?: number;
  avgLatencyMs?: number;
  jitterMs?: number;
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
const carrierColors = [
  'var(--ant-color-error)',
  'var(--ant-color-success)',
  'var(--ant-color-info)',
];

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
      {percent !== undefined ? (
        <Progress
          percent={Math.min(100, Math.max(0, percent))}
          showInfo={false}
          size="small"
          strokeColor={
            percent >= 90
              ? 'var(--ant-color-error)'
              : percent >= 75
                ? 'var(--ant-color-warning)'
                : 'var(--ant-color-primary)'
          }
          trailColor="var(--ant-color-fill-secondary)"
        />
      ) : (
        <div className="node-monitor-metric-no-progress" />
      )}
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

function NodeCard({ node }: { node: MonitoredNode }) {
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
    <article
      className={`node-monitor-card${!online ? ' is-offline' : coreIssue ? ' has-issue' : ''}`}
      aria-label={node.local ? t('nodeMonitor.local') : node.name}
    >
      <div className="node-monitor-card-head">
        <div className="node-monitor-card-title">
          <span
            className={`node-monitor-dot ${coreIssue ? 'warning' : online ? 'online' : 'offline'}`}
          />
          <strong>{node.local ? t('nodeMonitor.local') : node.name}</strong>
        </div>
        <Tag color={coreIssue ? 'warning' : online ? 'success' : 'default'}>{statusText}</Tag>
      </div>
      <div className="node-monitor-meta">
        <span className="node-monitor-address" title={node.address} dir="ltr">
          {node.address}
        </span>
        {node.country && <span>{node.country}</span>}
        {node.costLabel && <span>{node.costLabel}</span>}
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
                  : inbounds.length
                    ? formatBytes(used)
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
              <small>{t('nodeMonitor.speed')}</small>
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
              <small>{t('nodeMonitor.totalTraffic')}</small>
              <span>
                <UpOutlined /> {inbounds.length ? formatBytes(up) : '—'}
              </span>
              <span>
                <DownOutlined /> {inbounds.length ? formatBytes(down) : '—'}
              </span>
            </div>
            <div>
              <small>{t('nodeMonitor.uptime')}</small>
              <span>
                <CalendarOutlined />{' '}
                {validMetric && node.uptimeSecs !== undefined
                  ? node.uptimeSecs >= 86400
                    ? t('nodeMonitor.uptimeDays', { count: Math.floor(node.uptimeSecs / 86400) })
                    : t('nodeMonitor.uptimeHours', { count: Math.floor(node.uptimeSecs / 3600) })
                  : '—'}
              </span>
              <span>
                {node.lastHeartbeat > 0
                  ? t('nodeMonitor.lastHeartbeatShort', {
                      time: new Date(node.lastHeartbeat * 1000).toLocaleTimeString(i18n.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })
                  : '—'}
              </span>
            </div>
          </div>

          {node.carrierProbes?.length ? (
            <div className="node-monitor-probe-grid">
              <div className="node-monitor-carrier-heading">
                <span>{t('nodeMonitor.carrierCheck')}</span>
                <span>{t('nodeMonitor.latency')}</span>
                <span>{t('nodeMonitor.packetLoss')}</span>
              </div>
              {probes.map((probe, probeIndex) => (
                <div className="node-monitor-carrier-row" key={probe.name}>
                  <span>
                    <i style={{ background: carrierColors[probeIndex] }} />
                    {t(`nodeMonitor.carrier${probeIndex}`)}
                  </span>
                  <strong
                    className={
                      probe.state && probe.state !== 'ok' ? 'node-monitor-probe-warning' : undefined
                    }
                  >
                    {probe.state && probe.state !== 'ok'
                      ? t(`nodeMonitor.probeStates.${probe.state}`)
                      : probe.latencyMs === undefined
                        ? '—'
                        : `${probe.latencyMs.toFixed(1)} ms`}
                  </strong>
                  <strong
                    className={
                      probe.lossPct !== undefined && probe.lossPct > 0
                        ? 'node-monitor-probe-warning'
                        : undefined
                    }
                  >
                    {probe.lossPct === undefined ? '—' : `${probe.lossPct.toFixed(1)}%`}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="node-monitor-probe-empty">
              <span>{t('nodeMonitor.carrierMonitoring')}</span>
              <strong>{t('nodeMonitor.probeNotConfigured')}</strong>
            </div>
          )}
        </>
      )}

      <div className="node-monitor-card-actions">
        <ServerUsageButton nodeId={node.local ? 0 : node.id} />
      </div>
    </article>
  );
}

export default function NodeMonitorPage({ mockData }: { mockData?: MonitoredNode[] }) {
  const { t, i18n } = useTranslation();
  const { isDark, isUltra } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const query = useQuery({
    queryKey: ['nodes', 'monitor'],
    queryFn: async () => {
      const response = await HttpUtil.get<MonitoredNode[]>('/panel/api/nodes/monitor', undefined, {
        silent: true,
      });
      if (!response.success) throw new Error(response.msg || 'Could not load node monitoring');
      return response.obj || [];
    },
    refetchInterval: 5_000,
    retry: 1,
    enabled: !mockData,
    initialData: mockData,
  });
  const nodes = query.data || [];
  const onlineCount = nodes.filter((node) => node.status === 'online').length;
  const issueCount = nodes.filter(
    (node) => node.status === 'online' && ['error', 'stop'].includes(node.xrayState),
  ).length;

  const offlineCount = nodes.length - onlineCount;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleNodes = nodes.filter((node) => {
    const matchSearch = `${node.name} ${node.address} ${node.local ? t('nodeMonitor.local') : ''}`
      .toLowerCase()
      .includes(normalizedSearch);
    const hasIssue = node.status === 'online' && ['error', 'stop'].includes(node.xrayState);
    return (
      matchSearch &&
      (filter === 'all' ||
        (filter === 'online' && node.status === 'online') ||
        (filter === 'attention' && (node.status !== 'online' || hasIssue)))
    );
  });

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
              <div className="node-monitor-update-state">
                <span className={`node-monitor-dot ${query.isError ? 'warning' : 'online'}`} />
                <span>{t(mockData ? 'nodeMonitor.preview' : 'nodeMonitor.autoRefresh')}</span>
                {query.data && (
                  <time>
                    {t('nodeMonitor.updatedAt')}{' '}
                    {new Date(query.dataUpdatedAt).toLocaleTimeString(i18n.language)}
                  </time>
                )}
              </div>
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
            <div className="node-monitor-card-grid" aria-label={t('loading')}>
              {[0, 1].map((key) => (
                <div className="node-monitor-card" key={key}>
                  <Skeleton active paragraph={{ rows: 8 }} />
                </div>
              ))}
            </div>
          )}
          {query.data && (
            <>
              <div className="node-monitor-summary" aria-label={t('nodeMonitor.statusOverview')}>
                {[
                  { label: t('nodeMonitor.totalNodes'), value: nodes.length, tone: '' },
                  { label: t('nodeMonitor.onlineNodes'), value: onlineCount, tone: 'online' },
                  {
                    label: t('nodeMonitor.offlineNodes'),
                    value: offlineCount,
                    tone: offlineCount ? 'warning' : '',
                  },
                  {
                    label: t('nodeMonitor.coreIssues'),
                    value: issueCount,
                    tone: issueCount ? 'warning' : '',
                  },
                ].map((item) => (
                  <div key={item.label} className={item.tone}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <div className="node-monitor-toolbar">
                <Segmented
                  aria-label={t('nodeMonitor.filterStatus')}
                  value={filter}
                  onChange={(value) => setFilter(String(value))}
                  options={[
                    { label: t('all'), value: 'all' },
                    { label: t('nodeMonitor.onlineNodes'), value: 'online' },
                    { label: t('nodeMonitor.needsAttention'), value: 'attention' },
                  ]}
                />
                <Input
                  prefix={<SearchOutlined />}
                  aria-label={t('nodeMonitor.searchNodes')}
                  placeholder={t('nodeMonitor.searchNodes')}
                  value={search}
                  allowClear
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              {nodes.length === 0 ? (
                <Empty description={t('nodeMonitor.noNodes')} />
              ) : visibleNodes.length === 0 ? (
                <Empty description={t('nodeMonitor.noMatches')}>
                  <Button
                    onClick={() => {
                      setSearch('');
                      setFilter('all');
                    }}
                  >
                    {t('nodeMonitor.clearFilters')}
                  </Button>
                </Empty>
              ) : (
                <div className="node-monitor-card-grid">
                  {visibleNodes.map((node) => (
                    <NodeCard node={node} key={`${node.local ? 'local' : 'remote'}:${node.id}`} />
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
