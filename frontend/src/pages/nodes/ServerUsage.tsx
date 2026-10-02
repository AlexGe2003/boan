import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Progress,
  Select,
  Skeleton,
  Table,
  Typography,
  Tag,
} from 'antd';
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { ServerUsageReportSchema } from '@/generated/zod';
import { useTheme } from '@/hooks/useTheme';
import { HttpUtil, SizeFormatter } from '@/utils';
import UsageControlModal from './UsageControlModal';
import type { UsageControlTarget } from '@/schemas/server-usage-control';
import './ServerUsage.css';

const bytes = (value: number) => SizeFormatter.sizeFormat(value);
const date = (value: number) => (value ? new Date(value).toLocaleString() : '尚无记录');
const share = (value: number) => (
  <div className="server-usage-share">
    <Progress percent={Number(value.toFixed(1))} showInfo={false} size="small" />
    <span>{value.toFixed(1)}%</span>
  </div>
);

export default function ServerUsage({ email, nodeId }: { email?: string; nodeId?: number }) {
  const { antdThemeConfig } = useTheme();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | undefined>(email ? undefined : (nodeId ?? -1));
  const [includedNodes, setIncludedNodes] = useState<number[]>([]);
  const [editing, setEditing] = useState<UsageControlTarget | null>(null);
  const overview = selected === undefined || selected === -1;
  const userView = !!email && selected === undefined;
  const query = useQuery({
    queryKey: ['server-client-usage', email, selected],
    queryFn: async () => {
      const params =
        selected === undefined
          ? `?email=${encodeURIComponent(email || '')}`
          : selected === -1
            ? ''
            : `?nodeId=${selected}`;
      const result = await HttpUtil.get(`/panel/api/nodes/usage${params}`);
      if (!result.success) throw new Error(result.msg || '服务器流量加载失败');
      return ServerUsageReportSchema.parse(result.obj);
    },
    staleTime: 10_000,
    retry: false,
  });
  const visibleServers = query.data?.servers.filter(
    (row) => !includedNodes.length || includedNodes.includes(row.nodeId),
  );
  const total = visibleServers?.reduce((sum, row) => sum + row.used, 0) || 0;
  const billableTotal = visibleServers?.reduce((sum, row) => sum + row.billable, 0) || 0;
  const data =
    query.data && overview
      ? {
          ...query.data,
          total,
          billableTotal,
          servers: visibleServers!.map((row) => ({
            ...row,
            share: total ? (row.used / total) * 100 : 0,
            billingShare: billableTotal ? (row.billable / billableTotal) * 100 : 0,
          })),
        }
      : query.data;
  const server = data?.servers.find((item) => item.nodeId === selected);
  const billing = useMutation({
    mutationFn: async (multiplier: number) => {
      const result = await HttpUtil.post(
        '/panel/api/nodes/usage/billing',
        {
          nodeId: selected,
          multiplier,
        },
        { headers: { 'Content-Type': 'application/json' }, silent: true },
      );
      if (!result.success) throw new Error(result.msg || '计费口径保存失败');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['server-client-usage'] }),
  });
  const budget = (row: {
    quota: number;
    remaining: number;
    exceeded: boolean;
    quotaBasis: string;
  }) =>
    row.quota ? (
      <div>
        <span>
          {bytes(row.quota)} · {row.quotaBasis === 'billing' ? '计费估算' : '统计用量'}
        </span>
        <div>
          {row.exceeded ? <Tag color="error">已达额度</Tag> : `剩余 ${bytes(row.remaining)}`}
        </div>
      </div>
    ) : (
      <span>未设置</span>
    );
  const editServer = (row: NonNullable<typeof data>['servers'][number]) =>
    setEditing({
      nodeId: row.nodeId,
      email: userView ? email : undefined,
      name: userView ? `${email} · ${row.name}` : row.name,
      used: row.used,
      restoreUsed: userView ? row.recorded : row.used - row.unattributed,
      quota: row.quota,
      basis: row.quotaBasis,
    });
  return (
    <ConfigProvider theme={antdThemeConfig}>
      <div className="server-usage">
        <div className="server-usage-toolbar">
          {email && !userView && (
            <Button icon={<ArrowLeftOutlined />} onClick={() => setSelected(undefined)}>
              返回用户分布
            </Button>
          )}
          {!email && !overview && (
            <Button icon={<ArrowLeftOutlined />} onClick={() => setSelected(-1)}>
              返回服务器总览
            </Button>
          )}
          {userView ? (
            <Typography.Title level={5}>{email} · 各服务器流量</Typography.Title>
          ) : (
            <Select
              aria-label="选择流量统计服务器"
              value={selected}
              onChange={setSelected}
              options={[
                { value: -1, label: '全部服务器合计' },
                ...(query.data?.servers.map((item) => ({ value: item.nodeId, label: item.name })) ||
                  []),
              ]}
            />
          )}
          <Button
            icon={<ReloadOutlined />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新
          </Button>
        </div>
        {overview && data && (
          <div className="server-usage-toolbar">
            <Typography.Text>汇总服务器（可多选）</Typography.Text>
            <Select
              mode="multiple"
              allowClear
              aria-label="汇总服务器"
              placeholder="全部服务器；可选择香港中转、美国落地"
              value={includedNodes}
              onChange={setIncludedNodes}
              options={query.data?.servers.map((item) => ({
                value: item.nodeId,
                label: item.name,
              }))}
            />
            <Typography.Text type="secondary">
              合计包含所选服务器的全部已记录流量，不能自动区分同一服务器上的其他链路。
            </Typography.Text>
          </div>
        )}
        <Alert
          type="info"
          showIcon
          title="代理用量与服务器计费流量分开统计"
          description={`香港中转 → 美国落地的计费合计 = 香港统计用量 × 香港计费倍率 ＋ 美国统计用量 × 美国计费倍率。各服务器分别累计，不按链路去重；不会在合计后再统一乘 2。估算不含协议开销、重传和系统流量，不等于运营商账单，也不改变用户套餐扣量。两台服务器须独立接入并上报可归属用户的流量；级联子节点仍归入接入节点，不能从聚合计数还原每一跳。记录从功能启用后累计，续期或额度重置不清零。${overview ? '代理占比和计费占比分别按所选服务器的各自总量计算。' : '用户占比分母包含此服务器全部当前已记录用户。'}`}
        />
        {!overview && server && (
          <Button onClick={() => editServer(server)}>设置节点额度 / 用量</Button>
        )}
        {!overview && server?.quota ? (
          <Alert
            type={server.exceeded ? 'warning' : 'info'}
            title="节点额度状态"
            description={budget(server)}
          />
        ) : null}
        {!userView && server && (
          <div className="server-usage-toolbar">
            <Typography.Text>此服务器计费口径</Typography.Text>
            <Select
              aria-label="服务器计费口径"
              value={server.billingMultiplier}
              disabled={billing.isPending}
              onChange={(value) => billing.mutate(value)}
              options={[
                { value: 1, label: '已记录代理用量 × 1' },
                { value: 2, label: '中转双向收发 × 2（估算）' },
              ]}
            />
            <Typography.Text type="secondary">切换后重算全部已记录流量的估算值</Typography.Text>
          </div>
        )}
        {billing.isError && (
          <Alert type="error" title="计费口径保存失败" description={String(billing.error)} />
        )}
        {query.isLoading && <Skeleton active paragraph={{ rows: 5 }} />}
        {query.isError && (
          <Alert
            type="error"
            title="流量统计加载失败"
            description={String(query.error)}
            action={<Button onClick={() => void query.refetch()}>重试</Button>}
          />
        )}
        <Alert
          type="info"
          title="手动额度用于统计与超额提醒，不会自动断流。校正值不修改实际采集记录或用户套餐扣量。"
        />
        {editing && <UsageControlModal target={editing} onClose={() => setEditing(null)} />}
        {data && (
          <>
            <div className="server-usage-summary">
              <Card>
                <span>
                  {overview ? '所选服务器统计用量合计' : `${server?.name || '服务器'} · 统计用量`}
                </span>
                <strong>{bytes(data.total)}</strong>
              </Card>
              <Card>
                <span>{overview ? '所选服务器计费总流量（估算）' : '服务器计费流量（估算）'}</span>
                <strong>{bytes(data.billableTotal)}</strong>
                <small>按各服务器计费口径累计</small>
              </Card>
              <Card>
                <span>{overview ? '有流量记录的服务器' : '统计用户'}</span>
                <strong>
                  {overview ? data.servers.filter((item) => item.used > 0).length : data.userCount}
                </strong>
              </Card>
              <Card>
                <span>{overview ? '主要使用服务器' : '流量最多的用户'}</span>
                <strong>
                  {data.total
                    ? overview
                      ? data.servers[0]?.name
                      : data.users[0]?.username
                    : '暂无记录'}
                </strong>
                <small>
                  {data.total
                    ? `${(overview ? data.servers[0]?.share : data.users[0]?.share)?.toFixed(1)}%`
                    : '产生新流量后显示'}
                </small>
              </Card>
            </div>
            {overview ? (
              <Table
                rowKey="nodeId"
                dataSource={data.servers}
                pagination={false}
                scroll={{ x: 1750 }}
                columns={[
                  { title: '服务器', dataIndex: 'name', width: 170, fixed: 'left' },
                  { title: '采集上传', dataIndex: 'up', width: 100, render: bytes },
                  { title: '采集下载', dataIndex: 'down', width: 100, render: bytes },
                  {
                    title: '统计用量',
                    dataIndex: 'used',
                    width: 120,
                    render: (v: number) => <strong>{bytes(v)}</strong>,
                  },
                  {
                    title: userView ? '占该用户所选流量' : '占所选统计用量',
                    dataIndex: 'share',
                    width: 180,
                    render: share,
                  },
                  {
                    title: '计费口径',
                    dataIndex: 'billingMultiplier',
                    render: (value: number) => (value === 2 ? '中转双向 × 2' : '代理用量 × 1'),
                  },
                  { title: '计费流量（估算）', dataIndex: 'billable', width: 150, render: bytes },
                  { title: '额度 / 剩余', width: 200, render: (_, row) => budget(row) },
                  {
                    title: '手动校正',
                    dataIndex: 'adjustment',
                    width: 110,
                    render: (v: number) => (v ? `${v > 0 ? '+' : '−'}${bytes(Math.abs(v))}` : '无'),
                  },
                  { title: '占计费流量', dataIndex: 'billingShare', width: 180, render: share },
                  {
                    title: '操作',
                    width: 180,
                    fixed: 'right',
                    render: (_, row) => (
                      <div>
                        <Button type="link" onClick={() => setSelected(row.nodeId)}>
                          查看用户排行
                        </Button>
                        <Button type="link" onClick={() => editServer(row)}>
                          {userView ? '设置用户节点用量' : '设置节点用量'}
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            ) : (
              <Table
                rowKey="email"
                dataSource={data.users}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ x: 1500 }}
                columns={[
                  {
                    title: '用户',
                    width: 170,
                    fixed: 'left',
                    render: (_, row) => (
                      <div>
                        <strong>{row.username}</strong>
                        {row.email !== row.username && (
                          <div className="server-usage-email">{row.email}</div>
                        )}
                      </div>
                    ),
                  },
                  { title: '采集上传', dataIndex: 'up', width: 100, render: bytes },
                  { title: '采集下载', dataIndex: 'down', width: 100, render: bytes },
                  {
                    title: '统计用量',
                    dataIndex: 'used',
                    width: 120,
                    render: (v: number) => <strong>{bytes(v)}</strong>,
                    defaultSortOrder: 'descend',
                    sorter: (a, b) => a.used - b.used,
                  },
                  { title: '占服务器用户流量', dataIndex: 'share', width: 180, render: share },
                  { title: '计费流量（估算）', dataIndex: 'billable', width: 150, render: bytes },
                  { title: '额度 / 剩余', width: 200, render: (_, row) => budget(row) },
                  {
                    title: '手动校正',
                    dataIndex: 'adjustment',
                    width: 110,
                    render: (v: number) => (v ? `${v > 0 ? '+' : '−'}${bytes(Math.abs(v))}` : '无'),
                  },
                  { title: '最后产生流量', dataIndex: 'updatedAt', width: 180, render: date },
                  {
                    title: '操作',
                    width: 180,
                    fixed: 'right',
                    render: (_, row) => (
                      <Button
                        type="link"
                        onClick={() =>
                          setEditing({
                            nodeId: selected!,
                            email: row.email,
                            name: `${row.username} · ${server?.name}`,
                            used: row.used,
                            restoreUsed: row.recorded,
                            quota: row.quota,
                            basis: row.quotaBasis,
                          })
                        }
                      >
                        设置用户节点用量
                      </Button>
                    ),
                  },
                ]}
              />
            )}
            {data.truncated && (
              <Typography.Text type="secondary">
                仅展示流量最多的 100 位用户；占比分母包含全部 {data.userCount} 位已记录用户。
              </Typography.Text>
            )}
            <Typography.Paragraph type="secondary">
              统计用量 = 实际采集上传＋下载＋手动校正。
              {server?.unattributed
                ? `此节点包含 ${bytes(server.unattributed)} 未归属用户的手动量；用户占比分母包含它。`
                : ''}
              本次读取：{date(data.generatedAt)}。
              {server?.startedAt ? `该服务器最早记录：${date(server.startedAt)}。` : ''}
            </Typography.Paragraph>
          </>
        )}
      </div>
    </ConfigProvider>
  );
}
