import { Button, Space, Tag, message } from 'antd';
import { CopyOutlined, ExportOutlined } from '@ant-design/icons';
import { ClipboardManager } from '@/utils';
import type { SubscriptionClient } from './subscription-links';

const shadowrocketRules = 'https://status.huckge.com/client-rules/shadowrocket.conf';

export default function SubscriptionRouting({ client }: { client: SubscriptionClient }) {
  const [toast, contextHolder] = message.useMessage();
  const shadowrocket = client === 'shadowrocket';
  const clash = client === 'clash-verge' || client === 'clash-mi';
  const modes = [
    {
      key: 'config',
      title: '规则分流',
      detail: '国内网站和局域网直连，其他流量通过所选节点。适合日常使用。',
    },
    {
      key: 'proxy',
      title: '全局代理',
      detail: '交给客户端处理的流量统一走代理。适合临时排查无法访问的网站。',
    },
    {
      key: 'direct',
      title: '全部直连',
      detail: '不经过代理节点，使用当前网络直接访问。部分海外网站可能无法打开。',
    },
  ];
  return (
    <section className="subscription-routing" aria-label="连接模式">
      {contextHolder}
      <h2 className="subscription-step-title">3. 设置连接模式</h2>
      <div className="subscription-routing-modes">
        {modes.map((mode) => (
          <div key={mode.key}>
            <h3>
              {mode.title} {mode.key === 'config' && <Tag color="blue">推荐</Tag>}
            </h3>
            <p>{mode.detail}</p>
            {shadowrocket && (
              <Button href={`shadowrocket://route/${mode.key}`}>在小火箭中切换</Button>
            )}
          </div>
        ))}
      </div>
      {shadowrocket ? (
        <div className="subscription-routing-setup">
          <p>
            首次使用：先导入节点订阅，再安装分流配置，在小火箭「配置」中选用
            shadowrocket.conf，最后将「全局路由」设为「配置」。以后可使用上方按钮切换模式。
          </p>
          <Space wrap>
            <Button
              icon={<ExportOutlined />}
              href={`shadowrocket://config/add/${shadowrocketRules}`}
            >
              安装分流配置
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={async () => {
                try {
                  if (await ClipboardManager.copyText(shadowrocketRules))
                    toast.success('已复制分流配置地址');
                  else toast.error('复制失败，请重试');
                } catch {
                  toast.error('复制失败，请重试');
                }
              }}
            >
              复制配置地址
            </Button>
          </Space>
          <p className="subscription-routing-hint">
            导入节点不会自动安装分流配置；按钮会唤起小火箭，网页不显示当前实际模式。
          </p>
        </div>
      ) : clash ? (
        <p className="subscription-routing-setup">
          订阅已内置国内／局域网直连规则。更新订阅并启用后，在客户端选择「规则 / Rule」，在 PROXY
          分组选择节点。临时需要全部走代理时选「全局 / Global」，不使用代理时选「直连 / Direct」。
        </p>
      ) : (
        <p className="subscription-routing-setup">
          节点订阅不会覆盖客户端路由。
          {client === 'v2rayng'
            ? '请在 v2rayNG 的路由设置／预定义规则中选择「绕过局域网及大陆地址」。'
            : client === 'v2rayn'
              ? '请在 v2rayN 的路由中选择「绕过大陆」，系统代理选择「自动配置系统代理」；使用 TUN 时以客户端设置为准。'
              : '请在客户端选择「绕过局域网及大陆地址」或相应的规则模式。'}
          需要全局时在客户端切换路由；完全直连可断开客户端连接。
        </p>
      )}
    </section>
  );
}
