import ClientVisitsButton from '@/pages/nodes/ClientVisitsButton';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { z } from 'zod';
import { Alert, Badge, Button, Card, Progress, Skeleton, Space, Tag } from 'antd';
import {
  ApiOutlined,
  ArrowRightOutlined,
  CloudServerOutlined,
  CloudSyncOutlined,
  ControlOutlined,
  DatabaseOutlined,
  DownOutlined,
  FileTextOutlined,
  HistoryOutlined,
  LineChartOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  SettingOutlined,
  TeamOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { ClientsSummarySchema } from '@/generated/zod';
import { businessGet } from '@/pages/business/api';
import { useNodesQuery } from '@/api/queries/useNodesQuery';
import { useInboundOptions } from '@/api/queries/useInboundOptions';
import type { Status } from '@/models/status';
import './AdminOverview.css';

const summarySchema = z.object({ summary: ClientsSummarySchema });

export interface AdminOverviewProps {
  status?: Status;
  statusLoading?: boolean;
  onRefreshAll?: () => void;
  onRestartXray?: () => void;
  onStopXray?: () => void;
  onOpenConfig?: () => void;
  onOpenLogs?: () => void;
  onOpenBackup?: () => void;
  onOpenPanelUpdate?: () => void;
  onOpenSystemHistory?: () => void;
  onOpenXrayMetrics?: () => void;
  onToggleRuntime?: () => void;
  showRuntime?: boolean;
}

export default function AdminOverview({
  status,
  statusLoading,
  onRefreshAll,
  onRestartXray,
  onStopXray,
  onOpenConfig,
  onOpenLogs,
  onOpenBackup,
  onOpenPanelUpdate,
  onOpenSystemHistory,
  onOpenXrayMetrics,
  onToggleRuntime,
  showRuntime,
}: AdminOverviewProps) {
  const { t } = useTranslation();
  const users = useQuery({
    queryKey: ['admin-overview', 'users'],
    queryFn: () =>
      businessGet('clients/list/paged', summarySchema, {
        page: 1,
        pageSize: 1,
        accountScope: 'accounts',
      }),
    staleTime: 30_000,
  });
  const nodesQuery = useNodesQuery();
  const inboundsQuery = useInboundOptions();

  const busy = users.isFetching || nodesQuery.loading || inboundsQuery.isFetching || statusLoading;
  const failed = users.isError || !!nodesQuery.fetchError || inboundsQuery.isError;

  const xrayRunning = status?.xray.state === 'running';
  const xrayError = status?.xray.state === 'error';
  const xrayStatusText = xrayRunning
    ? t('pages.index.xrayStatusRunning')
    : xrayError
      ? t('pages.index.xrayStatusError')
      : t('pages.index.xrayStatusStop');
  const xrayStatusColor = xrayRunning ? 'success' : xrayError ? 'error' : 'default';

  const tiles = [
    {
      key: 'users',
      title: t('adminOverview.users'),
      icon: <TeamOutlined className="admin-overview-tile-icon users" />,
      value: users.data?.summary.total,
      loading: users.isLoading,
      path: '/clients',
      detail: users.data
        ? t('adminOverview.online', { count: users.data.summary.onlineCount })
        : t('adminOverview.manageUsers'),
    },
    {
      key: 'nodes',
      title: t('adminOverview.nodes'),
      icon: <CloudServerOutlined className="admin-overview-tile-icon nodes" />,
      value: nodesQuery.totals.total,
      loading: nodesQuery.loading,
      path: '/node-monitor',
      detail: t('adminOverview.nodesDetail', {
        online: nodesQuery.totals.online,
        offline: nodesQuery.totals.offline,
      }),
    },
    {
      key: 'inbounds',
      title: t('adminOverview.inbounds'),
      icon: <ApiOutlined className="admin-overview-tile-icon inbounds" />,
      value: inboundsQuery.data?.length,
      loading: inboundsQuery.isLoading,
      path: '/inbounds',
      detail: t('adminOverview.inboundsDetail', {
        count: inboundsQuery.data?.length ?? 0,
      }),
    },
    {
      key: 'xray',
      title: t('adminOverview.xrayCore'),
      icon: <ControlOutlined className="admin-overview-tile-icon xray" />,
      value: xrayStatusText,
      tagColor: xrayStatusColor,
      loading: !status && statusLoading,
      path: '/xray',
      detail: status
        ? `CPU ${status.cpu.percent.toFixed(0)}% · RAM ${status.mem.percent.toFixed(0)}%`
        : '—',
    },
  ];

  const handleRefresh = () => {
    void Promise.all([users.refetch(), nodesQuery.refetch(), inboundsQuery.refetch()]);
    onRefreshAll?.();
  };

  return (
    <section className="admin-overview" aria-label={t('adminOverview.title')}>
      <header className="admin-overview-heading">
        <div>
          <div className="admin-overview-eyebrow">{t('adminOverview.admin')}</div>
          <h1>{t('adminOverview.title')}</h1>
          <p>{t('adminOverview.subtitle')}</p>
        </div>
        <div className="admin-overview-actions">
          <ClientVisitsButton />
          <Button icon={<ReloadOutlined />} loading={busy} onClick={handleRefresh}>
            {t('refresh')}
          </Button>
          <Link to="/clients">
            <Button type="primary" icon={<PlusOutlined />}>
              {t('adminOverview.manageUsers')}
            </Button>
          </Link>
        </div>
      </header>

      {failed && <Alert type="warning" title={t('adminOverview.loadError')} />}

      <div className="admin-overview-grid">
        {tiles.map((tile) => (
          <Link key={tile.key} to={tile.path} className="admin-overview-tile-link">
            <Card className="admin-overview-tile" hoverable>
              <div className="admin-overview-tile-top">
                <span className="admin-overview-label">{tile.title}</span>
                {tile.icon}
              </div>
              {tile.loading ? (
                <Skeleton.Input active size="small" />
              ) : (
                <div className="admin-overview-value">
                  {tile.tagColor ? (
                    <Tag color={tile.tagColor} className="admin-overview-status-tag">
                      {tile.value}
                    </Tag>
                  ) : (
                    (tile.value ?? '—')
                  )}
                </div>
              )}
              <div className="admin-overview-detail">{tile.detail}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="admin-overview-work">
        <Card title={t('adminOverview.shortcuts')} className="admin-work-card">
          <div className="admin-overview-sections">
            <div className="admin-overview-section-group">
              <div className="admin-overview-section-title">{t('adminOverview.operations')}</div>
              <div className="admin-overview-shortcuts">
                {[
                  {
                    path: '/clients',
                    title: t('adminOverview.manageUsers'),
                    desc: t('adminOverview.userHint'),
                  },
                  {
                    path: '/inbounds',
                    title: t('adminOverview.inbounds'),
                    desc: t('adminOverview.inboundsHint'),
                  },
                ].map((item) => (
                  <Link key={item.path} to={item.path} className="admin-shortcut-card">
                    <strong>
                      {item.title}
                      <ArrowRightOutlined className="shortcut-arrow" />
                    </strong>
                    <span>{item.desc}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="admin-overview-section-group">
              <div className="admin-overview-section-title">
                {t('adminOverview.infrastructure')}
              </div>
              <div className="admin-overview-shortcuts">
                {[
                  {
                    path: '/node-groups',
                    title: t('adminOverview.nodeGroups'),
                    desc: t('adminOverview.groupHint'),
                  },
                  {
                    path: '/node-monitor',
                    title: t('adminOverview.monitor'),
                    desc: t('adminOverview.monitorHint'),
                  },
                ].map((item) => (
                  <Link key={item.path} to={item.path} className="admin-shortcut-card">
                    <strong>
                      {item.title}
                      <ArrowRightOutlined className="shortcut-arrow" />
                    </strong>
                    <span>{item.desc}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="admin-overview-section-group">
              <div className="admin-overview-section-title">{t('adminOverview.system')}</div>
              <div className="admin-overview-shortcuts">
                {[
                  {
                    path: '/xray',
                    title: t('menu.xray'),
                    desc: t('adminOverview.routingHint'),
                  },
                  {
                    path: '/settings',
                    title: t('menu.settings'),
                    desc: t('adminOverview.settingsHint'),
                  },
                ].map((item) => (
                  <Link key={item.path} to={item.path} className="admin-shortcut-card">
                    <strong>
                      {item.title}
                      <ArrowRightOutlined className="shortcut-arrow" />
                    </strong>
                    <span>{item.desc}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title={t('adminOverview.quickOps')} className="admin-work-card admin-ops-card">
          <div className="admin-ops-container">
            <div className="admin-ops-header">
              <div className="admin-ops-status-line">
                <Badge status={xrayRunning ? 'success' : xrayError ? 'error' : 'default'} />
                <span className="admin-ops-status-name">Xray Core</span>
                <Tag color={xrayStatusColor}>{xrayStatusText}</Tag>
                {status?.xray.version && (
                  <span className="admin-ops-version">v{status.xray.version}</span>
                )}
              </div>
              <Space className="admin-ops-action-btns">
                {onRestartXray && (
                  <Button
                    size="small"
                    type="primary"
                    danger={xrayError}
                    icon={<ReloadOutlined />}
                    onClick={onRestartXray}
                  >
                    {t('adminOverview.restartCore')}
                  </Button>
                )}
                {onStopXray && (
                  <Button
                    size="small"
                    icon={<PoweroffOutlined />}
                    disabled={!xrayRunning}
                    onClick={onStopXray}
                  >
                    {t('adminOverview.stopCore')}
                  </Button>
                )}
                {onOpenConfig && (
                  <Button size="small" icon={<SettingOutlined />} onClick={onOpenConfig}>
                    {t('adminOverview.viewConfig')}
                  </Button>
                )}
              </Space>
            </div>

            {status && (
              <div className="admin-ops-resources">
                <div className="admin-res-row">
                  <div className="admin-res-label">
                    <span>{t('adminOverview.cpuUsage')}</span>
                    <span className="admin-res-num">{status.cpu.percent.toFixed(0)}%</span>
                  </div>
                  <Progress
                    percent={status.cpu.percent}
                    showInfo={false}
                    strokeColor={status.cpu.color}
                    size="small"
                  />
                </div>
                <div className="admin-res-row">
                  <div className="admin-res-label">
                    <span>{t('adminOverview.memUsage')}</span>
                    <span className="admin-res-num">{status.mem.percent.toFixed(0)}%</span>
                  </div>
                  <Progress
                    percent={status.mem.percent}
                    showInfo={false}
                    strokeColor={status.mem.color}
                    size="small"
                  />
                </div>
                <div className="admin-res-row">
                  <div className="admin-res-label">
                    <span>{t('adminOverview.diskUsage')}</span>
                    <span className="admin-res-num">{status.disk.percent.toFixed(0)}%</span>
                  </div>
                  <Progress
                    percent={status.disk.percent}
                    showInfo={false}
                    strokeColor={status.disk.color}
                    size="small"
                  />
                </div>
              </div>
            )}

            <div className="admin-ops-tools-section">
              <div className="admin-overview-section-title">{t('adminOverview.systemTools')}</div>
              <div className="admin-ops-tools-grid">
                {onOpenLogs && (
                  <Button
                    icon={<FileTextOutlined />}
                    className="admin-tool-btn"
                    onClick={onOpenLogs}
                  >
                    {t('adminOverview.sysLogs')}
                  </Button>
                )}
                {onOpenBackup && (
                  <Button
                    icon={<DatabaseOutlined />}
                    className="admin-tool-btn"
                    onClick={onOpenBackup}
                  >
                    {t('adminOverview.backupRestore')}
                  </Button>
                )}
                {onOpenPanelUpdate && (
                  <Button
                    icon={<CloudSyncOutlined />}
                    className="admin-tool-btn"
                    onClick={onOpenPanelUpdate}
                  >
                    {t('adminOverview.panelUpdate')}
                  </Button>
                )}
                {onOpenSystemHistory && (
                  <Button
                    icon={<HistoryOutlined />}
                    className="admin-tool-btn"
                    onClick={onOpenSystemHistory}
                  >
                    {t('adminOverview.perfHistory')}
                  </Button>
                )}
                {onOpenXrayMetrics && (
                  <Button
                    icon={<LineChartOutlined />}
                    className="admin-tool-btn"
                    onClick={onOpenXrayMetrics}
                  >
                    {t('adminOverview.xrayMetrics')}
                  </Button>
                )}
              </div>
            </div>

            {onToggleRuntime && (
              <Button
                block
                type="dashed"
                className="admin-toggle-detail-btn"
                icon={showRuntime ? <UpOutlined /> : <DownOutlined />}
                onClick={onToggleRuntime}
              >
                {showRuntime
                  ? t('adminOverview.collapseDetailedRuntime')
                  : t('adminOverview.toggleDetailedRuntime')}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
