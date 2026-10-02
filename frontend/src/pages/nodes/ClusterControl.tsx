import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import { HttpUtil } from '@/utils';

type Member = { guid: string; name: string; address: string };
type ClusterStatus = {
  clusterId: string;
  self: string;
  primary: string;
  phase: 'standalone' | 'joining' | 'active' | 'frozen' | 'committing';
  epoch: number;
  pending: boolean;
  peers: Member[];
};

export default function ClusterControl() {
  const [modal, modalContext] = Modal.useModal();
  const [messageApi, messageContext] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [url, setURL] = useState('');
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [target, setTarget] = useState<string>();
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ['cluster', 'status'],
    queryFn: async () => {
      const result = await HttpUtil.get<ClusterStatus>('/panel/api/cluster/status');
      if (!result?.success || !result.obj) throw new Error(result?.msg || '无法读取主站状态');
      return result.obj;
    },
    retry: false,
    refetchInterval: (query) => (query.state.data?.pending ? 2000 : false),
  });
  const cluster = status.data;
  const primary = cluster?.peers?.find((peer) => peer.guid === cluster.primary);
  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const result = await HttpUtil.post(`/panel/api/cluster/${action}`, payload);
      if (!result?.success) throw new Error(result?.msg || '操作未完成，请检查集群状态后恢复交接');
      setOpen(false);
      setTarget(undefined);
      if (action === 'transfer' || action === 'resume') {
        messageApi.success('交接已完成，正在刷新登录状态');
        window.location.reload();
      } else {
        messageApi.success(
          action === 'abort'
            ? '已取消交接，原主站继续工作'
            : '统一登录已启用，各站使用当前主站账号',
        );
      }
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
      await status.refetch();
    }
  }
  function transfer() {
    const selected = cluster?.peers.find((peer) => peer.guid === target);
    if (!selected) return;
    modal.confirm({
      title: `将 ${selected.name} 设为主站？`,
      content:
        '交接期间管理页面会短暂不可用。账号、权限和业务数据将迁移到新主站，原主站成为子节点。完成后需要重新登录。若中断，请在本页面恢复交接，不要重复初始化。',
      okText: '开始交接',
      cancelText: '取消',
      onOk: () => act('transfer', { target }),
    });
  }
  return (
    <Card size="small" title="主站与统一登录">
      {modalContext}
      {messageContext}
      {status.isPending ? (
        <Typography.Text>正在读取主站状态…</Typography.Text>
      ) : status.isError ? (
        <Alert
          type="error"
          showIcon
          title="无法读取集群状态"
          description={status.error.message}
          action={<Button onClick={() => status.refetch()}>重试</Button>}
        />
      ) : cluster?.phase === 'standalone' ? (
        <Space orientation="vertical">
          <Typography.Text>
            每个节点均可作为登录入口，共用主站账号。管理员可以手动把任意已加入的节点切换为主站。
          </Typography.Text>
          <Button type="primary" onClick={() => setOpen(true)}>
            启用统一登录
          </Button>
        </Space>
      ) : (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text>
            当前主站：{primary?.name || cluster?.primary} · 交接版本 {cluster?.epoch}
          </Typography.Text>
          {cluster?.pending ? (
            <Alert
              type="warning"
              showIcon
              title="交接尚未完成，管理写入已暂停"
              description="请修复节点连接后恢复交接。系统不会自动启用第二个主站。"
              action={
                <Space wrap>
                  <Button loading={busy} onClick={() => act('resume')}>
                    恢复交接
                  </Button>
                  {cluster?.phase === 'frozen' && cluster.self === cluster.primary ? (
                    <Button disabled={busy} onClick={() => act('abort')}>
                      取消本次交接
                    </Button>
                  ) : null}
                </Space>
              }
            />
          ) : (
            <Space wrap>
              <Select
                aria-label="选择新主站"
                placeholder="选择新主站"
                style={{ minWidth: 220 }}
                value={target}
                onChange={setTarget}
                disabled={busy}
                options={cluster?.peers
                  .filter((peer) => peer.guid !== cluster.primary)
                  .map((peer) => ({ value: peer.guid, label: `${peer.name}（${peer.address}）` }))}
              />
              <Button type="primary" disabled={!target} loading={busy} onClick={transfer}>
                切换主站
              </Button>
            </Space>
          )}
        </Space>
      )}
      <Modal
        title="启用统一登录"
        open={open}
        confirmLoading={busy}
        onCancel={() => setOpen(false)}
        okText="检查并启用"
        cancelText="取消"
        onOk={() => act('initialize', { url, allowPrivate })}
        okButtonProps={{ disabled: !url.trim() }}
      >
        <Alert
          type="info"
          showIcon
          title="各节点需先更新到支持主站切换的版本"
          description="节点连接需使用管理员 API 令牌、经过验证的 HTTPS 证书、相同的面板路径及全部线路同步。启用后成员连接配置会锁定。子节点已有独立用户、订单、套餐或下级节点时，需要先整理数据；Telegram、Discord、LDAP 管理需先关闭。"
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical">
          <Form.Item label="本站可从其他节点访问的 HTTPS 地址" htmlFor="cluster-self-url" required>
            <Input
              id="cluster-self-url"
              value={url}
              onChange={(event) => setURL(event.target.value)}
              placeholder="https://panel.example.com/面板路径/"
              autoComplete="off"
            />
          </Form.Item>
          <Checkbox
            checked={allowPrivate}
            onChange={(event) => setAllowPrivate(event.target.checked)}
          >
            允许节点通过内网地址访问本站
          </Checkbox>
        </Form>
      </Modal>
    </Card>
  );
}
