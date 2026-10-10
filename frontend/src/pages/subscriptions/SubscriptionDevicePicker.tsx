import { useState } from 'react';
import { Button, Input, Modal, QRCode, Space, Tooltip, message, Tag } from 'antd';
import {
  AndroidOutlined,
  AppleOutlined,
  WindowsOutlined,
  LaptopOutlined,
  CopyOutlined,
  ExportOutlined,
  CheckOutlined,
  LinkOutlined,
  QrcodeOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { ClipboardManager } from '@/utils';
import shadowrocketIcon from '@/assets/clients/shadowrocket.png';
import clashIcon from '@/assets/clients/clash-verge.png';
import v2raynIcon from '@/assets/clients/v2rayn.png';
import v2rayngIcon from '@/assets/clients/v2rayng.png';
import {
  subscriptionAddress,
  subscriptionImportLink,
  type SubscriptionClient,
} from './subscription-links';
import SubscriptionRouting from './SubscriptionRouting';

type Device = 'ios' | 'android' | 'windows' | 'macos';

const devices = [
  { value: 'windows' as const, label: 'Windows', icon: <WindowsOutlined /> },
  { value: 'macos' as const, label: 'macOS', icon: <LaptopOutlined /> },
  { value: 'android' as const, label: 'Android', icon: <AndroidOutlined /> },
  { value: 'ios' as const, label: 'iOS', icon: <AppleOutlined /> },
];

const clients: Record<
  Exclude<SubscriptionClient, 'clash-mi' | 'karing'>,
  { name: string; detail: string; icon?: string; badge?: string }
> = {
  shadowrocket: {
    name: 'Shadowrocket',
    detail: '小火箭 · 规则分流',
    icon: shadowrocketIcon,
    badge: '推荐',
  },
  'clash-verge': {
    name: 'Clash Verge Rev',
    detail: 'Clash / Mihomo 内核',
    icon: clashIcon,
    badge: '推荐',
  },
  v2rayn: { name: 'v2rayN', detail: 'VLESS / Xray 内核', icon: v2raynIcon },
  v2rayng: { name: 'v2rayNG', detail: 'VLESS / Xray 移动端', icon: v2rayngIcon, badge: '推荐' },
  universal: { name: '通用订阅', detail: '复制到兼容客户端' },
};

function initialDevice(): Device {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1))
    return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(ua)) return 'macos';
  return 'windows';
}

function deviceClients(
  device: Device,
  hasClash: boolean,
): Exclude<SubscriptionClient, 'clash-mi' | 'karing'>[] {
  if (device === 'ios') return ['shadowrocket'];
  if (device === 'android') return ['v2rayng'];
  if (device === 'windows') return hasClash ? ['clash-verge', 'v2rayn'] : ['v2rayn'];
  if (device === 'macos') return hasClash ? ['clash-verge', 'shadowrocket'] : ['shadowrocket'];
  if (!hasClash) return ['shadowrocket', 'universal'];
  return ['clash-verge'];
}

export default function SubscriptionDevicePicker({
  url,
  clashUrl,
}: {
  url: string;
  clashUrl?: string;
}) {
  const currentDetected = initialDevice();
  const [device, setDevice] = useState<Device>(initialDevice);
  const [choice, setChoice] = useState<Exclude<SubscriptionClient, 'clash-mi' | 'karing'>>(
    () => deviceClients(initialDevice(), !!clashUrl)[0],
  );
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [toast, contextHolder] = message.useMessage();

  const available = deviceClients(device, !!clashUrl);
  const client = available.includes(choice) ? choice : available[0];
  const selected = clients[client];

  const getAddress = () => subscriptionAddress(client, url, clashUrl, window.location.origin);

  const copy = async () => {
    setCopying(true);
    try {
      if (await ClipboardManager.copyText(getAddress())) {
        setCopied(true);
        toast.success(`已复制 ${selected.name} 订阅链接`);
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.error('复制失败，请允许剪贴板访问后重试');
      }
    } catch {
      toast.error('订阅地址无效，请联系管理员');
    } finally {
      setCopying(false);
    }
  };

  const importSubscription = () => {
    try {
      const link = subscriptionImportLink(client, getAddress());
      if (link) {
        window.location.href = link;
        toast.info(`正在唤起 ${selected.name}；若未自动打开，请点击「复制链接」手动导入。`);
      }
    } catch {
      toast.error('订阅地址无效，请联系管理员');
    }
  };

  return (
    <div className="subscription-device-picker">
      {contextHolder}

      <div className="subscription-section-header">
        <h2 className="subscription-step-title">
          <span className="step-num">1</span>
          <span>选择你的平台</span>
        </h2>
        <span className="step-desc">选择要配置代理客户端的操作系统</span>
      </div>

      <div className="subscription-device-tabs" role="group" aria-label="选择设备">
        {devices.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`subscription-device-tab ${device === item.value ? 'is-active' : ''}`}
            aria-label={item.label}
            aria-pressed={device === item.value}
            onClick={() => {
              setDevice(item.value);
              setChoice(deviceClients(item.value, !!clashUrl)[0]);
            }}
          >
            <div className="subscription-device-icon">{item.icon}</div>
            <span className="subscription-device-name">{item.label}</span>
            {currentDetected === item.value && (
              <span className="subscription-device-current-badge">当前系统</span>
            )}
          </button>
        ))}
      </div>

      <div className="subscription-section-header">
        <h2 className="subscription-step-title">
          <span className="step-num">2</span>
          <span>选择客户端</span>
        </h2>
        <span className="step-desc">建议选用带推荐标识的主流客户端</span>
      </div>

      <div className="subscription-client-grid" role="group" aria-label="选择应用">
        {available.map((id) => {
          const item = clients[id];
          const isSelected = client === id;
          return (
            <button
              className={`subscription-client ${isSelected ? 'is-selected' : ''}`}
              key={id}
              type="button"
              aria-label={item.name}
              aria-pressed={isSelected}
              onClick={() => setChoice(id)}
            >
              <div className="subscription-client-avatar">
                {item.icon ? (
                  <img src={item.icon} alt="" width={42} height={42} />
                ) : (
                  <LinkOutlined className="subscription-generic-icon" />
                )}
              </div>
              <div className="subscription-client-label">
                <div className="subscription-client-heading">
                  <strong>{item.name}</strong>
                  {item.badge && (
                    <Tag color="processing" className="subscription-client-badge">
                      <ThunderboltFilled style={{ marginRight: 2 }} />
                      {item.badge}
                    </Tag>
                  )}
                </div>
                <small>{item.detail}</small>
              </div>
              <div className="subscription-client-check" aria-hidden="true">
                {isSelected && <CheckOutlined />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="subscription-section-header">
        <h2 className="subscription-step-title">
          <span className="step-num">3</span>
          <span>订阅地址与配置</span>
        </h2>
        <span className="step-desc">一键导入或复制订阅 URL 到软件内更新</span>
      </div>

      <div className="subscription-url-card">
        <div className="subscription-url-header">
          <span className="subscription-url-label">专属订阅地址</span>
          <span className="subscription-url-security-tag">个人专属 · 自动同步</span>
        </div>
        <div className="subscription-url-input-wrap">
          <Input
            readOnly
            value={getAddress()}
            aria-label="订阅地址"
            className="subscription-url-input"
            suffix={
              <Space size={4}>
                <Tooltip title={copied ? '已复制！' : '复制地址'}>
                  <Button
                    type="text"
                    size="small"
                    aria-label="复制地址"
                    icon={
                      copied ? <CheckOutlined style={{ color: '#10b981' }} /> : <CopyOutlined />
                    }
                    onClick={() => void copy()}
                  />
                </Tooltip>
                <Tooltip title="扫码导入">
                  <Button
                    type="text"
                    size="small"
                    aria-label="扫码导入"
                    icon={<QrcodeOutlined />}
                    onClick={() => setShowQr(true)}
                  />
                </Tooltip>
              </Space>
            }
          />
        </div>

        <div className="subscription-primary-actions">
          <Button
            type="primary"
            size="large"
            icon={<ExportOutlined />}
            disabled={client === 'universal' || client === 'v2rayn'}
            onClick={importSubscription}
            className="subscription-import-btn"
          >
            一键导入到 {selected.name}
          </Button>
          <Button
            size="large"
            icon={copied ? <CheckOutlined style={{ color: '#10b981' }} /> : <CopyOutlined />}
            loading={copying}
            onClick={() => void copy()}
            className={`subscription-copy-btn ${copied ? 'is-copied' : ''}`}
          >
            {copied ? '已复制！' : '复制链接'}
          </Button>
          <Button
            size="large"
            icon={<QrcodeOutlined />}
            onClick={() => setShowQr(true)}
            className="subscription-qr-btn"
          >
            二维码
          </Button>
        </div>

        <div className="subscription-import-notice">
          {client === 'v2rayn' ? (
            <span>
              💡 提示：v2rayN
              用户请点击「复制链接」，在客户端「订阅分组」→「订阅分组设置」中添加并更新。
            </span>
          ) : client === 'universal' ? (
            <span>💡 提示：通用订阅适用于各种自定义客户端，复制链接并在软件内导入即可。</span>
          ) : (
            <span>
              💡 提示：请先在设备上安装对应客户端，再点击「一键导入」，或点击「复制链接」手动粘贴。
            </span>
          )}
        </div>
      </div>

      <details className="subscription-help">
        <summary>
          <span>导入与连接帮助指南</span>
          <span className="subscription-help-chevron">›</span>
        </summary>
        <div className="subscription-help-content">
          <p className="subscription-help-intro">
            导入成功后，请根据需要选择分流规则。推荐使用「规则分流」，国内外网站智能分流更省流更快捷。
          </p>
          <SubscriptionRouting client={client} />
        </div>
      </details>

      <Modal
        open={showQr}
        onCancel={() => setShowQr(false)}
        footer={
          <div className="subscription-qr-footer">
            <Button
              type="primary"
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              loading={copying}
              onClick={() => void copy()}
            >
              {copied ? '已复制！' : '复制订阅链接'}
            </Button>
            <Button onClick={() => setShowQr(false)}>关闭</Button>
          </div>
        }
        centered
        title={
          <div className="subscription-qr-title">
            <QrcodeOutlined />
            <span>{selected.name} 订阅二维码</span>
          </div>
        }
        width={360}
        className="subscription-qr-modal"
      >
        <div className="subscription-qr-body">
          <div className="subscription-qr-card">
            <QRCode
              value={getAddress()}
              size={230}
              color="#000000"
              bgColor="#ffffff"
              marginSize={3}
              errorLevel="M"
              bordered={false}
              style={{ margin: '0 auto', display: 'block', borderRadius: 8 }}
            />
          </div>
          <p className="subscription-qr-tip">
            {client === 'clash-verge' || client === 'v2rayn'
              ? '如需手机扫码，请在页面上方选择对应手机系统（iOS / Android）再扫码。'
              : `请使用 ${selected.name} 应用内的「扫一扫」功能扫描此二维码。`}
          </p>
        </div>
      </Modal>
    </div>
  );
}
