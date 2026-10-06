import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Empty,
  Input,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  CopyOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  AppstoreOutlined,
  BarsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { ClipboardManager, HttpUtil } from '@/utils';
import './NodeStatus.css';

interface Node {
  id: number;
  name: string;
  protocol: string;
  status: string;
}

interface RegionInfo {
  flag: string;
  name: string;
}

function parseRegion(nodeName: string): RegionInfo {
  const n = (nodeName || '').toLowerCase();
  if (n.includes('香港') || /(^|[^a-z])hk(?=[^a-z]|$)/.test(n) || n.includes('hong kong') || n.includes('hongkong')) {
    return { flag: '🇭🇰', name: '香港' };
  }
  if (n.includes('日本') || /(^|[^a-z])jp(?=[^a-z]|$)/.test(n) || n.includes('japan') || n.includes('tokyo') || n.includes('osaka')) {
    return { flag: '🇯🇵', name: '日本' };
  }
  if (n.includes('新加坡') || /(^|[^a-z])sg(?=[^a-z]|$)/.test(n) || n.includes('singapore')) {
    return { flag: '🇸🇬', name: '新加坡' };
  }
  if (
    n.includes('美国') ||
    /(^|[^a-z])us(?=[^a-z]|$)/.test(n) ||
    n.includes('usa') ||
    n.includes('america') ||
    n.includes('los angeles') ||
    n.includes('san jose') ||
    n.includes('美西') ||
    n.includes('美东')
  ) {
    return { flag: '🇺🇸', name: '美国' };
  }
  if (n.includes('台湾') || /(^|[^a-z])tw(?=[^a-z]|$)/.test(n) || n.includes('taiwan') || n.includes('taipei')) {
    return { flag: '🇹🇼', name: '台湾' };
  }
  if (n.includes('韩国') || /(^|[^a-z])kr(?=[^a-z]|$)/.test(n) || n.includes('korea') || n.includes('seoul')) {
    return { flag: '🇰🇷', name: '韩国' };
  }
  if (n.includes('英国') || /(^|[^a-z])uk(?=[^a-z]|$)/.test(n) || /(^|[^a-z])gb(?=[^a-z]|$)/.test(n) || n.includes('london')) {
    return { flag: '🇬🇧', name: '英国' };
  }
  if (n.includes('德国') || /(^|[^a-z])de(?=[^a-z]|$)/.test(n) || n.includes('germany') || n.includes('frankfurt')) {
    return { flag: '🇩🇪', name: '德国' };
  }
  if (n.includes('加拿大') || /(^|[^a-z])ca(?=[^a-z]|$)/.test(n) || n.includes('canada')) {
    return { flag: '🇨🇦', name: '加拿大' };
  }
  if (n.includes('澳大利亚') || /(^|[^a-z])au(?=[^a-z]|$)/.test(n) || n.includes('australia') || n.includes('sydney')) {
    return { flag: '🇦🇺', name: '澳大利亚' };
  }
  if (n.includes('法国') || /(^|[^a-z])fr(?=[^a-z]|$)/.test(n) || n.includes('france') || n.includes('paris')) {
    return { flag: '🇫🇷', name: '法国' };
  }
  if (n.includes('荷兰') || /(^|[^a-z])nl(?=[^a-z]|$)/.test(n) || n.includes('netherlands')) {
    return { flag: '🇳🇱', name: '荷兰' };
  }
  return { flag: '🌐', name: '地区未标注' };
}

function getProtocolTag(protocol: string) {
  const p = (protocol || '').toLowerCase();
  let color = 'blue';
  let label = protocol.toUpperCase();
  if (p.includes('vless')) {
    color = 'geekblue';
    label = 'VLESS';
  } else if (p.includes('vmess')) {
    color = 'purple';
    label = 'VMess';
  } else if (p.includes('trojan')) {
    color = 'magenta';
    label = 'Trojan';
  } else if (p.includes('shadowsocks') || p.includes('ss')) {
    color = 'green';
    label = 'Shadowsocks';
  } else if (p.includes('hysteria') || p.includes('hy2')) {
    color = 'volcano';
    label = 'Hysteria 2';
  } else if (p.includes('tuic')) {
    color = 'cyan';
    label = 'TUIC';
  } else if (p.includes('wireguard') || p.includes('awg')) {
    color = 'gold';
    label = 'WireGuard';
  }
  return <Tag color={color} style={{ borderRadius: 6, fontWeight: 600 }}>{label}</Tag>;
}

export default function NodeStatus() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [toast, contextHolder] = message.useMessage();

  const query = useQuery({
    queryKey: ['customer-node-status'],
    queryFn: async () => {
      const r = await HttpUtil.get<Node[]>('/panel/api/support/nodes', undefined, { silent: true });
      if (!r.success) throw new Error(r.msg);
      return r.obj ?? [];
    },
    refetchInterval: 30000,
  });

  const filteredNodes = useMemo(() => {
    const list = query.data ?? [];
    if (!search.trim()) return list;
    const term = search.trim().toLowerCase();
    return list.filter(
      (n) =>
        n.name.toLowerCase().includes(term) ||
        n.protocol.toLowerCase().includes(term) ||
        parseRegion(n.name).name.includes(term)
    );
  }, [query.data, search]);

  const stats = useMemo(() => {
    const list = query.data ?? [];
    const total = list.length;
    const enabled = list.filter((n) => n.status === '已启用').length;
    return { total, enabled, disabled: total - enabled };
  }, [query.data]);

  const handleCopy = async (text: string) => {
    if (await ClipboardManager.copyText(text)) toast.success('节点名称已复制');
    else toast.error('复制失败，请重试');
  };

  return (
    <div className="node-status-container">
      {contextHolder}
      <div className="node-status-header">
        <div className="node-status-title-group">
          <Typography.Title level={3} className="node-status-title">
            我的节点
          </Typography.Title>
          <span className="node-status-updated">
            {query.dataUpdatedAt > 0 ? `更新于 ${new Date(query.dataUpdatedAt).toLocaleTimeString('zh-CN')}` : '正在获取配置'} · 每 30 秒自动更新
          </span>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新状态
          </Button>
        </Space>
      </div>

      <div className="node-status-stats">
        {[
          ['总接入节点', stats.total],
          ['已启用配置', stats.enabled],
          ['未启用配置', stats.disabled],
        ].map(([label, count]) => (
          <div className="node-stat-card" key={label}>
            <span className="node-stat-label">{label}</span>
            <span className="node-stat-value">
              {query.data ? count : '—'}<span className="node-stat-unit">个</span>
            </span>
          </div>
        ))}
      </div>
      <p className="node-status-note">
        配置状态不代表实际连通性。连接异常时，请先在客户端更新订阅。
        {query.isError && query.data ? ' 当前刷新失败，展示上次结果。' : ''}
      </p>

      {query.isError && (
        <Alert
          type="error"
          title="节点状态更新失败"
          description="请检查网络后重试。"
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
          showIcon
        />
      )}

      <div className="node-status-toolbar">
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />}
          aria-label="搜索节点"
          placeholder="搜索节点名称、地区或协议 (如 香港, VLESS)..."
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <div className="node-status-actions">
          <span className="node-status-count">
            {query.data ? `${filteredNodes.length} / ${stats.total} 个节点` : ''}
          </span>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as 'grid' | 'table')}
            options={[
              { value: 'grid', icon: <AppstoreOutlined />, label: '卡片视图' },
              { value: 'table', icon: <BarsOutlined />, label: '列表视图' },
            ]}
          />
        </div>
      </div>

      {query.isLoading ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin description="正在获取节点…" />
        </div>
      ) : query.isError && !query.data ? null : viewMode === 'grid' ? (
        filteredNodes.length === 0 ? (
          <Empty description={search.trim() ? '没有符合筛选条件的节点' : '尚未分配节点，请联系管理员'} />
        ) : (
          <div className="node-status-grid">
            {filteredNodes.map((item) => {
              const reg = parseRegion(item.name);
              const isEnabled = item.status === '已启用';
              return (
                <div className="node-card-item" key={item.id}>
                  <div className="node-card-top">
                    <span className="node-card-region">
                      <span className="node-card-flag">{reg.flag}</span>
                      {reg.name}
                    </span>
                    {getProtocolTag(item.protocol)}
                  </div>
                  <div className="node-card-name" title={item.name}>
                    <ThunderboltOutlined style={{ color: 'var(--ant-color-primary, #1e5eff)' }} />
                    <span className="node-card-name-text">{item.name}</span>
                    <Tooltip title="复制节点名称">
                      <Button
                        type="text"
                        size="small"
                        aria-label="复制节点名称"
                        icon={<CopyOutlined />}
                        onClick={() => void handleCopy(item.name)}
                      />
                    </Tooltip>
                  </div>
                  <div className="node-card-bottom">
                    <div className="node-card-status">
                      <span className={`node-pulse-dot ${isEnabled ? 'online' : 'offline'}`} />
                      <span style={{ color: isEnabled ? '#52c41a' : 'var(--ant-color-text-secondary)' }}>
                        {isEnabled ? '已启用' : item.status || '未启用'}
                      </span>
                    </div>
                    <Tag variant="filled" style={{ margin: 0, fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
                      #{item.id}
                    </Tag>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <Table<Node>
          className="node-status-table"
          size="middle"
          scroll={{ x: 580 }}
          pagination={{ hideOnSinglePage: true, pageSize: 20, showSizeChanger: false }}
          rowKey="id"
          dataSource={filteredNodes}
          loading={query.isLoading}
          locale={{ emptyText: search.trim() ? '没有符合筛选条件的节点' : '尚未分配节点，请联系管理员' }}
          columns={[
            {
              title: '地区 / 节点',
              dataIndex: 'name',
              render: (name: string) => {
                const reg = parseRegion(name);
                return (
                  <div className="node-list-name">
                    <span className="node-list-flag">{reg.flag}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <Typography.Text strong>{name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {reg.name} 节点
                      </Typography.Text>
                    </div>
                    <Tooltip title="复制节点名称">
                      <Button
                        type="text"
                        size="small"
                        aria-label="复制节点名称"
                        icon={<CopyOutlined />}
                        onClick={() => void handleCopy(name)}
                      />
                    </Tooltip>
                  </div>
                );
              },
            },
            {
              title: '传输协议',
              width: 140,
              dataIndex: 'protocol',
              render: (protocol: string) => getProtocolTag(protocol),
            },
            {
              title: '节点状态',
              width: 140,
              dataIndex: 'status',
              render: (v: string) => {
                const isEnabled = v === '已启用';
                return (
                  <Tag
                    color={isEnabled ? 'success' : 'default'}
                    icon={isEnabled ? <CheckCircleOutlined /> : <GlobalOutlined />}
                    style={{ borderRadius: 6 }}
                  >
                    {isEnabled ? '已启用' : v || '未启用'}
                  </Tag>
                );
              },
            },
          ]}
        />
      )}
    </div>
  );
}
