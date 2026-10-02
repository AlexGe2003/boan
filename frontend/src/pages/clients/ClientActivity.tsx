import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
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
  const [hours, setHours] = useState(24);
  const [live, setLive] = useState(false);
  const query = useQuery({
    queryKey: ['client-activity', email, hours],
    queryFn: async () => {
      const result = await HttpUtil.get(
        `/panel/api/clients/activity/${encodeURIComponent(email)}?hours=${hours}`,
      );
      if (!result.success) throw new Error(result.msg || '访问记录加载失败');
      return ClientActivitySchema.parse(result.obj);
    },
    refetchInterval: live ? 15_000 : false,
    staleTime: 10_000,
    retry: false,
  });
  const data = query.data;
  return (
    <div className="client-activity">
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
      <Typography.Paragraph type="secondary">
        仅统计本机 Xray 日志中带有用户标识的访问连接记录。分类按域名近似判断，次数不等于流量；HTTPS
        不显示页面路径，远程节点暂未接入。
      </Typography.Paragraph>
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
          description="在 Xray 配置的日志设置中指定 access 文件路径，并确保入站客户端有 email 标识。开启后产生的新连接会显示在这里；历史记录无法补回。"
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
                <Statistic title="采样连接记录" value={data.connections} />
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
                <Statistic title="识别分类" value={data.categories.length} />
                <Typography.Text type="secondary">更新于 {date(data.generatedAt)}</Typography.Text>
              </Card>
            </Col>
          </Row>
          <Card title="最近 2 分钟访问">
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
              <Card title="网站 / 目标排行 · 最多 50 项">
                <Table
                  rowKey="host"
                  size="small"
                  dataSource={data.destinations}
                  scroll={{ x: 520 }}
                  pagination={{ pageSize: 8 }}
                  columns={[
                    {
                      title: '域名 / IP',
                      dataIndex: 'host',
                      render: (v: string) => <span dir="ltr">{v}</span>,
                    },
                    { title: '分类', dataIndex: 'category' },
                    { title: '连接次数', dataIndex: 'count' },
                    { title: '最近访问', dataIndex: 'lastSeen', render: date },
                  ]}
                />
              </Card>
            </Col>
          </Row>
          <Card title="最近访问记录 · 最多 100 条">
            <Table
              rowKey={(r, index) => `${r.time}-${r.host}-${index}`}
              size="small"
              dataSource={data.visits}
              scroll={{ x: 520 }}
              pagination={{ pageSize: 8 }}
              columns={[
                { title: '时间', dataIndex: 'time', render: date },
                {
                  title: '域名 / IP',
                  dataIndex: 'host',
                  render: (v: string) => <span dir="ltr">{v}</span>,
                },
                { title: '分类', dataIndex: 'category' },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
