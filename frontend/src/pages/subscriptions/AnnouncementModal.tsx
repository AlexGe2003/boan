import { Modal, Button, Tag, Typography, Space } from 'antd';
import {
  NotificationOutlined,
  CheckOutlined,
  CalendarOutlined,
  PushpinFilled,
  ArrowRightOutlined,
} from '@ant-design/icons';
import type { Announcement } from '@/models/announcement';

const { Paragraph, Text } = Typography;

interface AnnouncementModalProps {
  announcement: Announcement | null;
  open: boolean;
  onAcknowledge: (id: number) => void;
  onViewAll?: () => void;
}

export function getAnnouncementTagProps(tag: string) {
  switch (tag?.toLowerCase()) {
    case 'urgent':
      return { color: 'error', label: '重要警报' };
    case 'maintenance':
      return { color: 'warning', label: '维护通知' };
    case 'feature':
      return { color: 'success', label: '功能更新' };
    case 'notice':
    default:
      return { color: 'processing', label: '系统公告' };
  }
}

export default function AnnouncementModal({
  announcement,
  open,
  onAcknowledge,
  onViewAll,
}: AnnouncementModalProps) {
  if (!announcement) return null;

  const tagProps = getAnnouncementTagProps(announcement.tag);
  const formattedDate = announcement.createdAt
    ? new Date(announcement.createdAt).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Modal
      open={open}
      onCancel={() => onAcknowledge(announcement.id)}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          {onViewAll ? (
            <Button
              type="link"
              size="small"
              icon={<ArrowRightOutlined />}
              onClick={() => {
                onAcknowledge(announcement.id);
                onViewAll();
              }}
              style={{ paddingLeft: 0 }}
            >
              查看所有历史公告
            </Button>
          ) : <span />}
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => onAcknowledge(announcement.id)}
            style={{ minWidth: 100 }}
          >
            我知道了
          </Button>
        </div>
      }
      width={560}
      centered
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 24 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)',
              color: 'var(--ant-color-primary, #1677ff)',
              fontSize: 18,
            }}
          >
            <NotificationOutlined />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text strong style={{ fontSize: 16 }}>
                {announcement.title}
              </Text>
              {announcement.pinned && (
                <Tag color="red" icon={<PushpinFilled />} bordered={false}>
                  置顶
                </Tag>
              )}
              <Tag color={tagProps.color} bordered={false}>
                {tagProps.label}
              </Tag>
            </div>
            {formattedDate && (
              <div style={{ fontSize: 12, color: 'rgba(140, 140, 140, 0.9)', marginTop: 2 }}>
                <Space orientation="horizontal" size={4}>
                  <CalendarOutlined />
                  <span>发布时间：{formattedDate}</span>
                </Space>
              </div>
            )}
          </div>
        </div>
      }
    >
      <div
        style={{
          maxHeight: '60vh',
          overflowY: 'auto',
          padding: '16px 4px 8px 4px',
        }}
      >
        <div
          style={{
            background: 'var(--ant-color-fill-quaternary, rgba(0, 0, 0, 0.02))',
            border: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.06))',
            borderRadius: 8,
            padding: '14px 16px',
            fontSize: 14,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--ant-color-text, inherit)',
          }}
        >
          <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
            {announcement.content}
          </Paragraph>
        </div>
      </div>
    </Modal>
  );
}
