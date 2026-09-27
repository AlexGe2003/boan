import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Table, Tag } from 'antd';
import { HttpUtil } from '@/utils';
interface Node {
  id: number;
  name: string;
  protocol: string;
  status: string;
}
export default function NodeStatus() {
  const query = useQuery({
    queryKey: ['customer-node-status'],
    queryFn: async () => {
      const r = await HttpUtil.get<Node[]>('/panel/api/support/nodes', undefined, { silent: true });
      if (!r.success) throw new Error(r.msg);
      return r.obj ?? [];
    },
    refetchInterval: 30000,
  });
  return (
    <>
      <h2>节点状态</h2>
      <Alert
        type="info"
        showIcon
        title="展示管理员分配给您的节点及配置状态，每 30 秒更新。已启用不代表实时连通性检测通过；实际连接还受账号额度和有效期限制。外部订阅节点请在客户端更新后查看。"
        style={{ marginBottom: 16 }}
      />
      <Button
        loading={query.isFetching}
        onClick={() => void query.refetch()}
        style={{ marginBottom: 16 }}
      >
        刷新状态
      </Button>
      {query.isError && <Alert type="error" title={String(query.error)} />}
      <Table<Node>
        rowKey="id"
        dataSource={query.data}
        loading={query.isLoading}
        locale={{ emptyText: '暂无节点，请等待管理员分配套餐' }}
        columns={[
          { title: '节点', dataIndex: 'name' },
          { title: '协议', dataIndex: 'protocol' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (v: string) => <Tag color={v === '已启用' ? 'green' : 'default'}>{v}</Tag>,
          },
        ]}
      />
    </>
  );
}
