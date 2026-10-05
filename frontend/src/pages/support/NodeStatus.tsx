import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Empty,
  Input,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  BarsOutlined,
  CopyOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { HttpUtil } from '@/utils';
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
  if (n.includes('香港') || n.includes('hk') || n.includes('hong kong') || n.includes('hongkong')) {
    return { flag: '🇭🇰', name: '香港' };
  }
  if (n.includes('日本') || n.includes('jp') || n.includes('japan') || n.includes('tokyo') || n.includes('osaka')) {
    return { flag: '🇯🇵', name: '日本' };
  }
  if (n.includes('新加坡') || n.includes('sg') || n.includes('singapore')) {
    return { flag: '🇸🇬', name: '新加坡' };
  }
  if (
    n.includes('美国') ||
    n.includes('us') ||
    n.includes('usa') ||
    n.includes('america') ||
    n.includes('los angeles') ||
    n.includes('san jose') ||
    n.includes('美西') ||
    n.includes('美东')
  ) {
    return { flag: '🇺🇸', name: '美国' };
  }
  if (n.includes('台湾') || n.includes('tw') || n.includes('taiwan') || n.includes('taipei')) {
    return { flag: '🇹🇼', name: '台湾' };
  }
  if (n.includes('韩国') || n.includes('kr') || n.includes('korea') || n.includes('seoul')) {
    return { flag: '🇰🇷', name: '韩国' };
  }
  if (n.includes('英国') || n.includes('uk') || n.includes('gb') || n.includes('london')) {
    return { flag: '🇬🇧', name: '英国' };
  }
  if (n.includes('德国') || n.includes('de') || n.includes('germany') || n.includes('frankfurt')) {
    return { flag: '🇩🇪', name: '德国' };
  }
  if (n.includes('加拿大') || n.includes('ca') || n.includes('canada')) {
    return { flag: '🇨🇦', name: '加拿大' };
  }
  if (n.includes('澳大利亚') || n.includes('au') || n.includes('australia') || n.includes('sydney')) {
    return { flag: '🇦🇺', name: '澳大利亚' };
  }
  if (n.includes('法国') || n.includes('fr') || n.includes('france') || n.includes('paris')) {
    return { flag: '🇫🇷', name: '法国' };
  }
  if (n.includes('荷兰') || n.includes('nl') || n.includes('netherlands')) {
    return { flag: '🇳🇱', name: '荷兰' };
  }
  return { flag: '🌐', name: '全球网络' };
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
    const term = search.toLowerCase();
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
    const online = list.filter((n) => n.status === '已启用').length;
    const regions = new Set(list.map((n) => parseRegion(n.name).name)).size;
    const protocols = new Set(list.map((n) => (n.protocol || '').toLowerCase())).size;
    return { total, online, regions, protocols };
  }, [query.data]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('节点名称已复制');
  };

  return (
    <div className="node-status-container">
      {contextHolder}
      <div className="node-status-header">
        <div className="node-status-title-group">
          <Typography.Title level={3} className="node-status-title">
            节点状态
          </Typography.Title>
          <Tag color="processing" icon={<CheckCircleOutlined />}>
            30s 实时同步
          </Tag>
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
        <div className="node-stat-card">
          <span className="node-stat-label">总接入节点</span>
          <span className="node-stat-value">
            {stats.total} <span className="node-stat-unit">个</span>
          </span>
        </div>
        <div className="node-stat-card">
          <span className="node-stat-label">运行状态</span>
          <span className="node-stat-value" style={{ color: '#52c41a' }}>
            {stats.online} <span className="node-stat-unit">可用</span>
          </span>
        </div>
        <div className="node-stat-card">
          <span className="node-stat-label">覆盖地区</span>
          <span className="node-stat-value">
            {stats.regions} <span className="node-stat-unit">个国家/地区</span>
          </span>
        </div>
        <div className="node-stat-card">
          <span className="node-stat-label">传输协议</span>
          <span className="node-stat-value">
            {stats.protocols} <span className="node-stat-unit">种</span>
          </span>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        description="展示管理员分配给您的节点及配置状态，每 30 秒自动更新。若节点已启用但在客户端无法连通，请确保客户端已更新最新订阅，并检查账号有效期及剩余流量额度。"
      />

      {query.isError && <Alert type="error" title={String(query.error)} showIcon />}

      <div className="node-status-toolbar">
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />}
          placeholder="搜索节点名称、地区或协议 (如 香港, VLESS)..."
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as 'grid' | 'table')}
          options={[
            { value: 'grid', icon: <AppstoreOutlined />, label: '卡片视图' },
            { value: 'table', icon: <BarsOutlined />, label: '列表视图' },
          ]}
        />
      </div>

      {viewMode === 'grid' ? (
        filteredNodes.length === 0 ? (
          <Empty description={search ? '未找到匹配的节点' : '暂无节点，请等待管理员分配套餐'} />
        ) : (
          <div className="node-status-grid">
            {filteredNodes.map((item) => {
              const reg = parseRegion(item.name);
              const isOnline = item.status === '已启用';
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
                    <ThunderboltOutlined style={{ color: 'var(--ant-color-primary)' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </span>
                    <Tooltip title="复制节点名称">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(item.name)}
                      />
                    </Tooltip>
                  </div>
                  <div className="node-card-bottom">
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                      <span className={`node-pulse-dot ${isOnline ? 'online' : 'offline'}`} />
                      <span style={{ color: isOnline ? '#52c41a' : 'var(--ant-color-text-secondary)' }}>
                        {isOnline ? '正常在线' : item.status || '未启用'}
                      </span>
                    </div>
                    <Tag bordered={false} style={{ margin: 0, fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>
                      ID #{item.id}
                    </Tag>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <Table<Node>
          rowKey="id"
          dataSource={filteredNodes}
          loading={query.isLoading}
          locale={{ emptyText: search ? '未找到匹配的节点' : '暂无节点，请等待管理员分配套餐' }}
          columns={[
            {
              title: '地区 / 节点',
              dataIndex: 'name',
              render: (name: string) => {
                const reg = parseRegion(name);
                return (
                  <Space orientation="vertical" size={2}>
                    <Space>
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{reg.flag}</span>
                      <Typography.Text strong>{name}</Typography.Text>
                      <Tooltip title="复制节点名称">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopy(name)}
                        />
                      </Tooltip>
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {reg.name} 节点
                    </Typography.Text>
                  </Space>
                );
              },
            },
            {
              title: '传输协议',
              dataIndex: 'protocol',
              render: (protocol: string) => getProtocolTag(protocol),
            },
            {
              title: '节点状态',
              dataIndex: 'status',
              render: (v: string) => {
                const isOnline = v === '已启用';
                return (
                  <Tag
                    color={isOnline ? 'success' : 'default'}
                    icon={isOnline ? <CheckCircleOutlined /> : <GlobalOutlined />}
                    style={{ borderRadius: 6 }}
                  >
                    {isOnline ? '正常在线' : v || '未启用'}
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
