import { useState } from 'react';
import { Button, Input, Modal, QRCode, Space, Tag, Tooltip, message } from 'antd';
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
} from '@ant-design/icons';
import { ClipboardManager } from '@/utils';
import shadowrocketIcon from '@/assets/clients/shadowrocket.png';
import clashIcon from '@/assets/clients/clash-verge.png';
import v2raynIcon from '@/assets/clients/v2rayn.png';
import v2rayngIcon from '@/assets/clients/v2rayng.png';
import clashMiIcon from '@/assets/clients/clash-mi.png';
import { subscriptionAddress, subscriptionImportLink, type SubscriptionClient } from './subscription-links';

type Device = 'ios' | 'android' | 'windows' | 'macos';

const devices = [
  { value: 'windows' as const, label: 'Windows', icon: <WindowsOutlined /> },
  { value: 'macos' as const, label: 'macOS', icon: <LaptopOutlined /> },
  { value: 'android' as const, label: 'Android', icon: <AndroidOutlined /> },
  { value: 'ios' as const, label: 'iOS / 苹果', icon: <AppleOutlined /> },
];

const clients: Record<SubscriptionClient, { name: string; detail: string; icon?: string }> = {
  shadowrocket: { name: 'Shadowrocket', detail: '小火箭', icon: shadowrocketIcon },
  'clash-verge': { name: 'Clash Verge Rev', detail: 'Clash / Mihomo', icon: clashIcon },
  'clash-mi': { name: 'Clash Mi', detail: 'Clash / Mihomo', icon: clashMiIcon },
  v2rayn: { name: 'v2rayN', detail: 'VLESS / Xray', icon: v2raynIcon },
  v2rayng: { name: 'v2rayNG', detail: 'VLESS / Xray', icon: v2rayngIcon },
  universal: { name: '通用订阅', detail: '复制到兼容客户端' },
};

function initialDevice(): Device {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(ua)) return 'macos';
  return 'windows';
}

function deviceClients(device: Device, hasClash: boolean): SubscriptionClient[] {
  if (device === 'ios') return hasClash ? ['shadowrocket', 'clash-mi'] : ['shadowrocket'];
  if (device === 'android') return hasClash ? ['v2rayng', 'clash-mi'] : ['v2rayng'];
  if (device === 'windows') return hasClash ? ['clash-verge', 'v2rayn'] : ['v2rayn'];
  if (device === 'macos') return hasClash ? ['clash-verge', 'shadowrocket'] : ['shadowrocket'];
  if (!hasClash) return ['shadowrocket', 'universal'];
  return ['clash-verge'];
}

function isRecommended(device: Device, client: SubscriptionClient): boolean {
  if (device === 'windows' && client === 'clash-verge') return true;
  if (device === 'macos' && client === 'clash-verge') return true;
  if (device === 'ios' && client === 'shadowrocket') return true;
  if (device === 'android' && client === 'v2rayng') return true;
  return false;
}

export default function SubscriptionDevicePicker({ url, clashUrl }: { url: string; clashUrl?: string }) {
  const [device, setDevice] = useState<Device>(initialDevice);
  const [choice, setChoice] = useState<SubscriptionClient>(() => deviceClients(initialDevice(), !!clashUrl)[0]);
  const [copying, setCopying] = useState(false);
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
        toast.success(`已复制 ${selected.name} 订阅链接`);
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
        toast.info('正在唤起客户端；若未打开，请先安装对应客户端或点击复制链接。');
      }
    } catch {
      toast.error('订阅地址无效，请联系管理员');
    }
  };

  return (
    <div className="subscription-device-picker">
      {contextHolder}
      <h2 className="subscription-step-title">1. 选择您的设备系统</h2>
      <div className="subscription-device-tabs" role="group" aria-label="选择设备">
        {devices.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={device === item.value}
            onClick={() => {
              setDevice(item.value);
              setChoice(deviceClients(item.value, !!clashUrl)[0]);
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <h2 className="subscription-step-title">2. 选择配套客户端</h2>
      <div className="subscription-client-grid" role="group" aria-label="选择应用">
        {available.map((id) => {
          const rec = isRecommended(device, id);
          return (
            <button
              className="subscription-client"
              key={id}
              type="button"
              aria-pressed={client === id}
              onClick={() => setChoice(id)}
            >
              {clients[id].icon ? (
                <img src={clients[id].icon} alt="" width={42} height={42} />
              ) : (
                <LinkOutlined className="subscription-generic-icon" />
              )}
              <span className="subscription-client-label">
                <strong>
                  {clients[id].name}
                  {rec && (
                    <Tag color="blue" style={{ marginLeft: 8, fontSize: 11, borderRadius: 4 }}>
                      推荐
                    </Tag>
                  )}
                </strong>
                <small>{clients[id].detail}</small>
              </span>
              <span className="subscription-client-check" aria-hidden="true">
                {client === id && <CheckOutlined />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="subscription-url-row">
        <span className="subscription-url-label">订阅地址</span>
        <Input
          readOnly
          value={getAddress()}
          aria-label="订阅地址"
          className="subscription-url-input"
          suffix={
            <Space size={2}>
              <Tooltip title="复制地址">
                <Button
                  type="text"
                  size="small"
                  aria-label="复制地址"
                  icon={<CopyOutlined />}
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
        >
          一键导入到客户端
        </Button>
        <Button size="large" icon={<CopyOutlined />} loading={copying} onClick={() => void copy()}>
          复制订阅链接
        </Button>
        <Button size="large" icon={<QrcodeOutlined />} onClick={() => setShowQr(true)}>
          二维码扫码
        </Button>
      </div>

      <p className="subscription-privacy-note">
        {client === 'v2rayn'
          ? '提示：v2rayN 用户请点击「复制订阅链接」，在软件内「订阅分组」->「订阅分组设置」中添加并更新。'
          : client === 'universal'
            ? '提示：通用订阅支持大部分兼容客户端，请复制链接后导入到对应工具。'
            : `提示：点击「一键导入到客户端」将直接唤起 ${selected.name} 并配置节点规则；或点击复制链接手动导入。`}
        <br />
        🔒 订阅链接包含个人密钥，请勿泄漏或分享给他人。
      </p>

      <Modal
        open={showQr}
        onCancel={() => setShowQr(false)}
        footer={null}
        centered
        title="扫码导入订阅"
        width={340}
      >
        <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
          <QRCode
            value={getAddress()}
            size={220}
            style={{ margin: '0 auto 16px', background: '#fff', padding: 12, borderRadius: 12 }}
          />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--customer-text-muted)' }}>
            请使用手机客户端（Shadowrocket / v2rayNG 等）扫码导入
          </p>
        </div>
      </Modal>
    </div>
  );
}
