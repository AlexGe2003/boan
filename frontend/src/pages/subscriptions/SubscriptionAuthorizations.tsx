import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Popconfirm, Space, Spin } from 'antd';
import { z } from 'zod';
import { ClientDeviceSlotsSchema } from '@/generated/zod';
import { HttpUtil } from '@/utils';
import SubscriptionDevicePicker from './SubscriptionDevicePicker';

const issuedSchema = z.object({ id: z.number(), token: z.string().length(64), name: z.string() });

export function authorizedAddress(address: string, token: string) {
  const url = new URL(address, window.location.origin);
  url.searchParams.set('device_token', token);
  url.searchParams.set('view', 'raw');
  return url.toString();
}

export default function SubscriptionAuthorizations({
  userId,
  url,
  clashUrl,
}: {
  userId: number;
  url: string;
  clashUrl?: string;
}) {
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<z.infer<typeof issuedSchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['my-devices', userId],
    queryFn: async () => {
      const result = await HttpUtil.get('/panel/api/clients/myDevices', undefined, {
        silent: true,
      });
      if (!result.success) throw new Error(result.msg || '授权加载失败');
      return ClientDeviceSlotsSchema.parse(result.obj);
    },
    refetchInterval: 30000,
    retry: false,
  });
  const issue = async (label: string, replaceId = 0) => {
    setBusy(true);
    setError('');
    try {
      const result = await HttpUtil.post(
        '/panel/api/clients/myDevices',
        { name: label, replaceId },
        { silent: true, headers: { 'Content-Type': 'application/json' } },
      );
      if (!result.success) throw new Error(result.msg || '授权创建失败');
      setIssued(issuedSchema.parse(result.obj));
      setName('');
      await cache.invalidateQueries({ queryKey: ['my-devices', userId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : '授权创建失败');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: number) => {
    setBusy(true);
    setError('');
    try {
      const result = await HttpUtil.delete(`/panel/api/clients/myDevices/${id}`, { silent: true });
      if (!result.success) throw new Error(result.msg || '撤销失败');
      if (issued?.id === id) setIssued(null);
      await cache.invalidateQueries({ queryKey: ['my-devices', userId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败');
    } finally {
      setBusy(false);
    }
  };
  const active =
    issued && query.data?.devices.some((device) => device.id === issued.id) ? issued : null;
  return (
    <section className="subscription-authorizations">
      <h2>订阅授权</h2>
      <p>
        每个名额生成独立订阅链接，支持普通 Clash
        客户端。链接可被复制，因此限制的是授权名额，不是实际设备数量。创建首个授权后，原通用链接停止更新；已有节点不变。
      </p>
      {query.isPending && <Spin />}
      {(error || query.isError) && (
        <Alert type="error" showIcon title={error || query.error?.message} />
      )}
      {query.data && (
        <>
          <p>
            已使用 {query.data.registered} / {query.data.limit || 3} 个名额（含已有设备绑定）
          </p>
          <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
            <Input
              aria-label="授权名称"
              placeholder="例如：Windows 电脑、安卓手机"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="primary"
              loading={busy}
              disabled={!name.trim() || query.data.full}
              onClick={() => void issue(name.trim())}
            >
              创建授权
            </Button>
          </Space.Compact>
          {query.data.devices.map((device) => (
            <div key={device.id} className="subscription-authorization-row">
              <span>
                {device.deviceModel || '未命名设备'} ·{' '}
                {device.authorization ? '订阅授权' : '已有设备绑定'}
              </span>
              <Space wrap>
                <Popconfirm
                  title={device.authorization ? '重新生成授权链接？' : '将旧绑定转为订阅授权？'}
                  description="旧链接不能继续更新；不增加名额，已导入的节点不变。"
                  onConfirm={() => issue(device.deviceModel || '设备授权', device.id)}
                  okText="重新生成"
                  cancelText="取消"
                >
                  <Button disabled={busy}>
                    {device.authorization ? '重新生成链接' : '获取授权链接'}
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="撤销这个名额？"
                  description={
                    device.authorization
                      ? '旧授权链接将无法更新订阅；已导入的节点可能继续连接。'
                      : '解除旧设备绑定；原客户端再次更新时可能重新占用名额。'
                  }
                  onConfirm={() => revoke(device.id)}
                  okText="撤销"
                  cancelText="取消"
                >
                  <Button danger disabled={busy}>
                    撤销
                  </Button>
                </Popconfirm>
              </Space>
            </div>
          ))}
        </>
      )}
      {active && (
        <>
          <Alert
            type="info"
            showIcon
            title={`正在导入：${active.name}`}
            description="此链接只在本次页面中显示，请及时导入或保存。离开后可重新生成，但旧链接会失效。无需开启设备标识。"
            style={{ margin: '20px 0' }}
          />
          <SubscriptionDevicePicker
            url={authorizedAddress(url, active.token)}
            clashUrl={clashUrl ? authorizedAddress(clashUrl, active.token) : undefined}
          />
        </>
      )}
    </section>
  );
}
