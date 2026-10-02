import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Input,
  Layout,
  Result,
  Select,
  Skeleton,
  Tag,
  Typography,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { z } from 'zod';
import { NodeGroupBuyItemSchema, NodeGroupBuyReportSchema } from '@/generated/zod';
import { usePanelRole } from '@/api/queries/usePanelRole';
import { useTheme } from '@/hooks/useTheme';
import AppSidebar from '@/layouts/AppSidebar';
import { HttpUtil, SizeFormatter } from '@/utils';
import NodeGroupBuyModal from './NodeGroupBuyModal';
import '@/pages/business/business.css';
import './NodeGroupBuyPage.css';
import { groupBuyMoney as money, sortGroupBuyNodes, type GroupBuySort } from './groupBuyPricing';

const expiry = { unset: '未设置到期', active: '使用中', soon: '7 天内到期', expired: '已到期' };

export default function NodeGroupBuyPage() {
  const role = usePanelRole();
  const { antdThemeConfig, isDark, isUltra } = useTheme();
  const [editing, setEditing] = useState<z.infer<typeof NodeGroupBuyItemSchema> | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<GroupBuySort>('expiry');
  const query = useQuery({
    queryKey: ['node-group-buy'],
    enabled: role === 'admin',
    retry: false,
    staleTime: 30000,
    queryFn: async () => {
      const result = await HttpUtil.get('/panel/api/nodes/group-buy', undefined, { silent: true });
      if (!result.success) throw new Error(result.msg || '拼团配置加载失败');
      return NodeGroupBuyReportSchema.parse(result.obj);
    },
  });
  const rows = sortGroupBuyNodes(
    query.data?.nodes.filter(
      (row) =>
        `${row.name} ${row.config.groupName} ${row.config.provider} ${row.config.region}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()) &&
        (status === 'all' ||
          (status === 'attention'
            ? ['soon', 'expired'].includes(row.expiryStatus)
            : row.expiryStatus === status)),
    ) ?? [],
    sort,
  );
  return (
    <ConfigProvider theme={antdThemeConfig} locale={zhCN}>
      <Layout
        className={`settings-page business-page group-buy-layout${isDark ? ' is-dark' : ''}${isUltra ? ' is-ultra' : ''}`}
      >
        <AppSidebar />
        <Layout className="content-shell">
          <Layout.Content className="content-area" style={{ padding: 24, minWidth: 0 }}>
            {role !== 'admin' ? (
              <Result status="403" title="此页面仅限管理员" />
            ) : (
              <div className="group-buy-page">
                <div className="group-buy-header">
                  <div>
                    <Typography.Text type="secondary">拼团运营</Typography.Text>
                    <Typography.Title level={2}>拼团节点</Typography.Title>
                    <Typography.Paragraph type="secondary">
                      记录服务器成本与资源，分摊成员月费，单独核算你的手续费。
                    </Typography.Paragraph>
                  </div>
                  <div>
                    <Link to="/nodes">
                      <Button>连接配置</Button>
                    </Link>
                    <Button loading={query.isFetching} onClick={() => void query.refetch()}>
                      刷新
                    </Button>
                  </div>
                </div>
                {query.isLoading && <Skeleton active />}
                {query.isError && (
                  <Alert
                    type="error"
                    title="拼团配置加载失败"
                    description={String(query.error)}
                    action={<Button onClick={() => void query.refetch()}>重试</Button>}
                  />
                )}
                {query.data && (
                  <>
                    <div className="group-buy-summary">
                      <Card>
                        <span>配置月成本</span>
                        <strong>{money(query.data.monthlyCost)}</strong>
                      </Card>
                      <Card>
                        <span>预计月手续费</span>
                        <strong>{money(query.data.monthlyFee)}</strong>
                      </Card>
                      <Card>
                        <span>整团报价合计 / 月</span>
                        <strong>{money(query.data.monthlyTotal)}</strong>
                      </Card>
                      <Card>
                        <span>需关注到期</span>
                        <strong>
                          {query.data.dueSoon + query.data.expired} <small>台节点</small>
                        </strong>
                        <span>
                          {query.data.dueSoon} 台即将到期 · {query.data.expired} 台已到期
                        </span>
                        {query.data.dueSoon + query.data.expired > 0 && (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => {
                              setSearch('');
                              setStatus('attention');
                              setSort('expiry');
                            }}
                          >
                            查看需续费节点
                          </Button>
                        )}
                      </Card>
                    </div>
                    <Alert
                      type="info"
                      showIcon
                      title="手续费单独核算，报价不是到账收入"
                      description="每人参考月费 =（节点月租＋该节点整团月手续费）÷ 计划人数，分币向上取整。汇总包含所有已配置节点，包含到期节点；资源资料不会自动续费、扣款或限速。"
                    />
                    <div className="group-buy-filters">
                      <Input.Search
                        aria-label="搜索拼团节点"
                        placeholder="搜索节点、拼团、供应商或区域"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        allowClear
                      />
                      <Select
                        aria-label="到期状态"
                        value={status}
                        onChange={setStatus}
                        options={[
                          { value: 'all', label: '全部到期状态' },
                          { value: 'attention', label: '需关注到期' },
                          ...Object.entries(expiry).map(([value, label]) => ({ value, label })),
                        ]}
                      />
                      <Select
                        aria-label="节点排序"
                        value={sort}
                        onChange={setSort}
                        options={[
                          { value: 'expiry', label: '到期优先' },
                          { value: 'cost', label: '月租从高到低' },
                          { value: 'fee', label: '手续费从高到低' },
                          { value: 'perMember', label: '人均月费从高到低' },
                        ]}
                      />
                    </div>
                    <Typography.Text type="secondary">
                      显示 {rows.length} / {query.data.nodes.length} 台节点 ·{' '}
                      {query.data.nodes.filter((item) => item.configured).length} 台已配置
                    </Typography.Text>
                    {!rows?.length ? (
                      <Empty description="没有匹配的节点" />
                    ) : (
                      <div className="group-buy-grid">
                        {rows.map((item) => (
                          <Card
                            key={item.nodeId}
                            className="group-buy-card"
                            title={
                              <div>
                                <strong>{item.config.groupName || item.name}</strong>
                                {item.config.groupName && <span>{item.name}</span>}
                              </div>
                            }
                            extra={
                              <Tag
                                color={
                                  item.expiryStatus === 'expired'
                                    ? 'error'
                                    : item.expiryStatus === 'soon'
                                      ? 'warning'
                                      : item.expiryStatus === 'active'
                                        ? 'success'
                                        : 'default'
                                }
                              >
                                {expiry[item.expiryStatus as keyof typeof expiry] || '未设置'}
                              </Tag>
                            }
                          >
                            <div className="group-buy-price">
                              <span>节点月租</span>
                              <strong>
                                {money(item.config.monthlyPrice)}
                                <small> / 月</small>
                              </strong>
                            </div>
                            <dl>
                              <div>
                                <dt>手续费 / 月</dt>
                                <dd>
                                  {money(item.monthlyFee)}
                                  {item.config.feeMode === 'percent'
                                    ? `（月租的 ${(item.config.feeValue / 100).toFixed(2)}%）`
                                    : '（固定）'}
                                </dd>
                              </div>
                              <div>
                                <dt>整团报价 / 月</dt>
                                <dd>{money(item.monthlyTotal)}</dd>
                              </div>
                              <div>
                                <dt>计划人数 / 人均月费</dt>
                                <dd>
                                  {item.config.memberCount
                                    ? `${item.config.memberCount} 人 · ${money(item.perMember)}`
                                    : '待设置人数'}
                                </dd>
                              </div>
                              <div>
                                <dt>节点到期时间</dt>
                                <dd>
                                  {item.config.expiresAt
                                    ? new Date(item.config.expiresAt).toLocaleString()
                                    : '未设置'}
                                </dd>
                              </div>
                              <div>
                                <dt>带宽资料</dt>
                                <dd>
                                  {item.config.bandwidthMbps
                                    ? `${item.config.bandwidthMbps} Mbps · ${item.config.bandwidthMode === 'dedicated' ? '独享' : '共享'}`
                                    : '未设置'}
                                </dd>
                              </div>
                              <div>
                                <dt>供应商每月流量</dt>
                                <dd>
                                  {item.config.monthlyTraffic
                                    ? SizeFormatter.sizeFormat(item.config.monthlyTraffic)
                                    : '未设置'}
                                </dd>
                              </div>
                              <div>
                                <dt>供应商 / 区域</dt>
                                <dd>
                                  {[item.config.provider, item.config.region]
                                    .filter(Boolean)
                                    .join(' · ') || '未设置'}
                                </dd>
                              </div>
                            </dl>
                            {item.config.notes && (
                              <Typography.Paragraph type="secondary">
                                {item.config.notes}
                              </Typography.Paragraph>
                            )}
                            <Button block onClick={() => setEditing(item)}>
                              {item.configured ? '编辑拼团配置' : '设置拼团配置'}
                            </Button>
                          </Card>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {editing && <NodeGroupBuyModal item={editing} onClose={() => setEditing(null)} />}
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
