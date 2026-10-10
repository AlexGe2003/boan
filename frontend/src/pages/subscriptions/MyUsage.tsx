import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Segmented, Skeleton, Table, Tooltip } from 'antd';
import { BarChartOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons';
import { ClientUsageViewSchema, type ClientUsagePoint } from '@/generated/zod';
import { HttpUtil, SizeFormatter } from '@/utils';
import './CustomerUsage.css';

const bytes = SizeFormatter.sizeFormat;
const date = (timestamp: number, hourly = false) =>
  new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'UTC',
    month: '2-digit',
    day: '2-digit',
    ...(hourly ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  });

export function UsageBars({
  points,
  generatedAt,
  hourly,
}: {
  points: ClientUsagePoint[];
  generatedAt: number;
  hourly: boolean;
}) {
  const step = (hourly ? 1 : 24) * 3600000;
  const count = hourly ? 24 : 30;
  const last = Math.floor(generatedAt / step) * step;
  const values = new Map(points.map((point) => [point.bucket, point]));
  const slots = Array.from({ length: count }, (_, i) => {
    const timestamp = last - (count - 1 - i) * step;
    return { timestamp, point: values.get(timestamp) };
  });
  const max = Math.max(1, ...points.map((point) => point.up + point.down));
  if (points.length === 0)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未采集到分时流量" />;
  return (
    <div
      className="customer-usage-chart"
      role="list"
      aria-label={hourly ? '近 24 小时流量' : '近 30 天流量'}
    >
      <span className="customer-usage-scale">{bytes(max)}</span>
      {slots.map(({ timestamp, point }, i) => (
        <div key={timestamp} role="listitem" className="customer-usage-slot-item">
          <Tooltip
            trigger={['hover', 'focus', 'click']}
            title={`${date(timestamp, hourly)} UTC · ${point ? `上传 ${bytes(point.up)} / 下载 ${bytes(point.down)}` : '无采集记录'}`}
          >
            <button
              type="button"
              className="customer-usage-slot"
              aria-label={`${date(timestamp, hourly)} UTC：${point ? `上传 ${bytes(point.up)}，下载 ${bytes(point.down)}` : '无采集记录'}`}
            >
              <div className="customer-usage-bar-space">
                {point && (
                  <div
                    className="customer-usage-bar"
                    style={{ height: `${Math.max(1, ((point.up + point.down) / max) * 100)}%` }}
                  >
                    <span className="customer-usage-download" style={{ flex: point.down }} />
                    <span className="customer-usage-upload" style={{ flex: point.up }} />
                  </div>
                )}
              </div>
              <span className="customer-usage-axis">
                {i % (hourly ? 4 : 5) === 0 || i === count - 1
                  ? hourly
                    ? new Date(timestamp).getUTCHours() + ':00'
                    : date(timestamp)
                  : ''}
              </span>
            </button>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}

export default function MyUsage({
  userId,
  records = false,
  onRecords,
}: {
  userId: number;
  records?: boolean;
  onRecords?: () => void;
}) {
  const [resolution, setResolution] = useState<'day' | 'hour'>('day');
  const query = useQuery({
    queryKey: ['my-usage', userId, resolution],
    enabled: userId > 0,
    queryFn: async () => {
      const result = await HttpUtil.get(
        `/panel/api/clients/myUsage?resolution=${resolution}`,
        undefined,
        { silent: true },
      );
      if (!result.success) throw new Error(result.msg || '用量加载失败');
      return ClientUsageViewSchema.parse(result.obj);
    },
    refetchInterval: 30000,
    retry: false,
  });
  const data = query.isError ? undefined : query.data;
  const names = new Map(
    data?.traffic.nodes.map((node) => [
      node.nodeId,
      node.nodeName || (node.nodeId === 0 ? '主节点' : '历史节点'),
    ]),
  );
  return (
    <section className="customer-usage">
      <div className="customer-usage-toolbar">
        <div>
          <h2>{records ? '用量记录' : '流量用量'}</h2>
          <p>{resolution === 'day' ? '近 30 天 · 按天' : '近 24 小时 · 按小时'} · UTC</p>
        </div>
        <div className="customer-usage-controls">
          <Segmented
            aria-label="统计粒度"
            value={resolution}
            options={[
              { label: '按天', value: 'day' },
              { label: '按小时', value: 'hour' },
            ]}
            onChange={(value) => setResolution(value as 'day' | 'hour')}
          />
          <Button
            type="text"
            aria-label="刷新用量"
            icon={<ReloadOutlined />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          />
        </div>
      </div>
      {query.isPending && <Skeleton active paragraph={{ rows: 5 }} />}
      {query.isError && (
        <Alert
          type="error"
          title="用量加载失败"
          description={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      {data && (
        <>
          <div className="customer-usage-totals">
            {(
              [
                ['已采集累计', data.traffic.total],
                ['上传', data.traffic.up],
                ['下载', data.traffic.down],
              ] as const
            ).map(([label, value]) => (
              <div className="customer-card" key={label}>
                <span>{label}</span>
                <strong>{data.traffic.recorded ? bytes(value) : '—'}</strong>
              </div>
            ))}
          </div>
          {records ? (
            <section className="customer-card">
              <Table<ClientUsagePoint>
                size="small"
                rowKey={(row) => `${row.nodeId}:${row.bucket}`}
                dataSource={[...data.points].reverse()}
                columns={[
                  {
                    title: '时间（UTC）',
                    dataIndex: 'bucket',
                    render: (value: number) => date(value, resolution === 'hour'),
                  },
                  {
                    title: '节点',
                    dataIndex: 'nodeId',
                    render: (id: number) => names.get(id) || '历史节点',
                  },
                  { title: '上传', dataIndex: 'up', render: bytes },
                  { title: '下载', dataIndex: 'down', render: bytes },
                ]}
                pagination={{ pageSize: 15, hideOnSinglePage: true }}
                scroll={{ x: 340 }}
                locale={{ emptyText: '尚无用量记录' }}
              />
            </section>
          ) : data.traffic.nodes.length === 0 ? (
            <section className="customer-usage-empty">
              <BarChartOutlined />
              <h3>尚未采集到用量</h3>
              <p>开始采集后，这里将显示流量趋势。</p>
              <small>暂无数据不代表没有使用流量。</small>
            </section>
          ) : (
            data.traffic.nodes.map((node) => {
              const points = data.points.filter((point) => point.nodeId === node.nodeId);
              const up = points.reduce((sum, point) => sum + point.up, 0);
              const down = points.reduce((sum, point) => sum + point.down, 0);
              return (
                <section className="customer-card customer-usage-node" key={node.nodeId}>
                  <h3>{names.get(node.nodeId)}</h3>
                  <div className="customer-usage-legend">
                    <span>本时段 {points.length ? bytes(up + down) : '暂无记录'}</span>
                    <span>
                      <i className="customer-usage-upload" /> 上传 {bytes(up)}
                    </span>
                    <span>
                      <i className="customer-usage-download" /> 下载 {bytes(down)}
                    </span>
                  </div>
                  <UsageBars
                    points={points}
                    generatedAt={data.generatedAt}
                    hourly={resolution === 'hour'}
                  />
                </section>
              );
            })
          )}
          <p className="customer-usage-note">
            上传：用户 → 节点；下载：节点 →
            用户。分时数据从启用采集后开始记录，空档表示无采集记录；已采集累计量与套餐计费用量可能不同。
          </p>
          {!records && onRecords && (
            <button className="customer-records-link" onClick={onRecords}>
              查看用量记录
              <RightOutlined />
            </button>
          )}
        </>
      )}
    </section>
  );
}
