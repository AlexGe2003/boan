import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Select,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { HttpUtil } from '@/utils';
import { ClientActivitySchema } from '@/generated/zod';
import './ClientActivity.css';

const date = (time: number) => new Date(time).toLocaleString();

export default function ClientActivity({ email }: { email: string }) {
  const [scope, setScope] = useState('web');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>();
  const [hours, setHours] = useState(24);
  const [live, setLive] = useState(false);
  const query = useQuery({
    queryKey: ['client-activity', email, hours, scope],
    queryFn: async () => {
      const result = await HttpUtil.get(
        `/panel/api/clients/activity/${encodeURIComponent(email)}?hours=${hours}&scope=${scope}`,
      );
      if (!result.success) throw new Error(result.msg || '访问记录加载失败');
      return ClientActivitySchema.parse(result.obj);
    },
    refetchInterval: live ? 15_000 : false,
    staleTime: 10_000,
    retry: false,
  });
  const data = query.data;
  const matches = (row: { host: string; category: string }) =>
    row.host.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!category || row.category === category);

  return (
    <div className="client-activity">
      <Typography.Text strong>当前用户：{email}</Typography.Text>
      <div className="activity-toolbar">
        <Segmented
          aria-label="统计时间范围"
          value={hours}
          onChange={(v) => setHours(Number(v))}
          options={[
            { label: '最近 1 小时', value: 1 },
            { label: '最近 24 小时', value: 24 },
          ]}
        />
        <Space wrap>
          <Button onClick={() => setLive(!live)}>{live ? '停止自动刷新' : '每 15 秒刷新'}</Button>
          <Button
            icon={<ReloadOutlined />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新
          </Button>
        </Space>
      </div>
      <Segmented
        aria-label="访问目标类型"
        value={scope}
        onChange={(value) => {
          setScope(String(value));
          setCategory(undefined);
        }}
        options={[
          { label: '网站域名', value: 'web' },
          { label: 'DNS / IP 连接', value: 'network' },
          { label: '全部记录', value: 'all' },
        ]}
      />
      <Typography.Paragraph type="secondary">
        默认仅统计网站域名，DNS 和纯 IP 连接单独查看。分类根据域名推测，连接次数不等于浏览次数。
        仅统计本机开启日志后保留的连接；远程节点暂未接入。
      </Typography.Paragraph>
      <Alert
        type="info"
        showIcon
        title={scope === 'web' ? '没有域名的连接不会计入网站统计' : 'IP 地址不等于访问的网站'}
        description="1.1.1.1 等公共解析地址归入 DNS 服务。日志只有 IP 时无法可靠判断网站；可检查对应入站的域名嗅探（HTTP / TLS / QUIC）及客户端 DNS 设置，历史记录无法补全域名。"
      />
      {query.isLoading && <Skeleton active paragraph={{ rows: 5 }} />}
      {query.isError && (
        <Alert
          type="error"
          title="访问记录加载失败"
          description={String(query.error)}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      {data?.demo && (
        <Alert
          type="info"
          title="模拟访问数据"
          description="当前为本地演示日志，用于预览网站与分类统计。"
        />
      )}
      {data && data.status !== 'ready' && (
        <Alert
          type="warning"
          title={data.status === 'disabled' ? '尚未开启访问日志' : '访问日志暂不可读取'}
          description="先在代理核心设置中开启访问日志，再让该用户连接节点。新连接会显示在这里，开启前的历史无法补回。"
        />
      )}
      {data?.sampled && (
        <Alert
          type="warning"
          title="仅统计日志末尾 8 MB"
          description="当前结果为有界样本，不代表所选时段的完整访问量。"
        />
      )}
      {data?.status === 'ready' && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="当前范围连接次数" value={data.connections} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="最近 2 分钟访问目标" value={data.recent.length} />
                <Typography.Text type="secondary">不代表连接仍在持续</Typography.Text>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="当前范围分类数" value={data.categories.length} />
                <Typography.Text type="secondary">更新于 {date(data.generatedAt)}</Typography.Text>
              </Card>
            </Col>
          </Row>
          <Card title="最近 2 分钟访问 · 最多 30 项">
            {data.recent.length ? (
              <div className="activity-recent">
                {data.recent.map((v) => (
                  <div key={v.host}>
                    <strong dir="ltr">{v.host}</strong>
                    <Tag>{v.category}</Tag>
                    <Typography.Text type="secondary">{date(v.time)}</Typography.Text>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="最近 2 分钟没有新连接记录，已有长连接可能仍在运行。"
              />
            )}
          </Card>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={8}>
              <Card title="访问分类 · 按连接次数">
                {data.categories.length ? (
                  data.categories.map((c) => (
                    <div className="activity-category" key={c.name}>
                      <div>
                        <span>{c.name}</span>
                        <strong>{c.count} 次</strong>
                      </div>
                      <Progress
                        showInfo={false}
                        percent={data.connections ? (c.count / data.connections) * 100 : 0}
                      />
                    </div>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该时段暂无可分类记录" />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={16}>
              <Card title="访问目标排行 · 最多 50 项">
                <Space wrap style={{ marginBottom: 12 }}>
                  <Input.Search
                    aria-label="搜索域名或 IP"
                    placeholder="搜索域名或 IP"
                    allowClear
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Select
                    aria-label="筛选网站分类"
                    placeholder="全部分类"
                    allowClear
                    value={category}
                    onChange={setCategory}
                    style={{ minWidth: 150 }}
                    options={data.categories.map((item) => ({
                      label: item.name,
                      value: item.name,
                    }))}
                  />
                </Space>
                <Table
                  rowKey="host"
                  size="small"
                  dataSource={data.destinations.filter(matches)}
                  locale={{
                    emptyText:
                      search || category
                        ? '没有匹配的访问目标'
                        : '该时段没有此类记录，可切换目标类型查看',
                  }}
                  scroll={{ x: 520 }}
                  pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: true }}
                  columns={[
                    {
                      title: '域名 / IP',
                      dataIndex: 'host',
                      render: (v: string) => <span dir="ltr">{v}</span>,
                    },
                    {
                      title: '分类',
                      dataIndex: 'category',
                      render: (value: string) => <Tag>{value}</Tag>,
                    },
                    { title: '连接次数', dataIndex: 'count', sorter: (a, b) => a.count - b.count },
                    { title: '最近访问', dataIndex: 'lastSeen', render: date },
                  ]}
                />
              </Card>
            </Col>
          </Row>
          <Card
            title="最近连接记录 · 最多 100 条"
            extra={search || category ? <Tag>已应用筛选</Tag> : undefined}
          >
            <Table
              rowKey={(r, index) => `${r.time}-${r.host}-${index}`}
              size="small"
              dataSource={data.visits.filter(matches)}
              scroll={{ x: 520 }}
              pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: true }}
              columns={[
                { title: '时间', dataIndex: 'time', render: date },
                {
                  title: '域名 / IP',
                  dataIndex: 'host',
                  render: (v: string) => <span dir="ltr">{v}</span>,
                },
                {
                  title: '分类',
                  dataIndex: 'category',
                  render: (value: string) => <Tag>{value}</Tag>,
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
