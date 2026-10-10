import { useState, useMemo } from 'react';
import { Card, Tag, Input, Radio, Empty, Button, Badge, Typography, Space, Skeleton } from 'antd';
import {
  SearchOutlined,
  PushpinFilled,
  CalendarOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { Announcement } from '@/models/announcement';
import { getAnnouncementTagProps } from './AnnouncementModal';

const { Paragraph, Text, Title } = Typography;

interface AnnouncementsViewProps {
  announcements: Announcement[];
  loading?: boolean;
  onRefresh?: () => void;
  readIds: number[];
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

export default function AnnouncementsView({
  announcements,
  loading = false,
  onRefresh,
  readIds,
  onMarkRead,
  onMarkAllRead,
}: AnnouncementsViewProps) {
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const filteredList = useMemo(() => {
    return announcements.filter((item) => {
      const matchTag = tagFilter === 'all' || item.tag.toLowerCase() === tagFilter.toLowerCase();
      const matchKeyword =
        !searchKeyword.trim() ||
        item.title.toLowerCase().includes(searchKeyword.trim().toLowerCase()) ||
        item.content.toLowerCase().includes(searchKeyword.trim().toLowerCase());
      return matchTag && matchKeyword;
    });
  }, [announcements, tagFilter, searchKeyword]);

  const unreadCount = useMemo(() => {
    return announcements.filter((a) => !readIds.includes(a.id)).length;
  }, [announcements, readIds]);

  return (
    <div
      className="announcements-container"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Top action bar: filters and search */}
      <Card size="small" bordered={false} className="customer-card" style={{ borderRadius: 12 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Radio.Group
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              buttonStyle="solid"
              size="middle"
            >
              <Radio.Button value="all">全部 ({announcements.length})</Radio.Button>
              <Radio.Button value="urgent">重要警报</Radio.Button>
              <Radio.Button value="notice">系统公告</Radio.Button>
              <Radio.Button value="maintenance">维护通知</Radio.Button>
              <Radio.Button value="feature">功能更新</Radio.Button>
            </Radio.Group>
            {unreadCount > 0 && (
              <Button size="small" icon={<CheckCircleOutlined />} onClick={onMarkAllRead}>
                全部标为已读 ({unreadCount})
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input
              placeholder="搜索公告标题或内容..."
              prefix={<SearchOutlined style={{ color: 'rgba(0, 0, 0, 0.45)' }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            {onRefresh && (
              <Button
                icon={<ReloadOutlined />}
                onClick={onRefresh}
                loading={loading}
                title="刷新公告"
              />
            )}
          </div>
        </div>
      </Card>

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card bordered={false} className="customer-card" style={{ borderRadius: 12 }}>
            <Skeleton active paragraph={{ rows: 3 }} />
          </Card>
          <Card bordered={false} className="customer-card" style={{ borderRadius: 12 }}>
            <Skeleton active paragraph={{ rows: 2 }} />
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredList.length === 0 && (
        <Card
          bordered={false}
          className="customer-card"
          style={{ borderRadius: 12, padding: '40px 0' }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              searchKeyword || tagFilter !== 'all' ? '没有找到符合条件的公告' : '暂无系统公告'
            }
          />
        </Card>
      )}

      {/* Announcements List */}
      {!loading && filteredList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredList.map((item) => {
            const isRead = readIds.includes(item.id);
            const tagProps = getAnnouncementTagProps(item.tag);
            const formattedDate = item.createdAt
              ? new Date(item.createdAt).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';

            return (
              <Card
                key={item.id}
                bordered={false}
                className="customer-card announcement-item-card"
                style={{
                  borderRadius: 12,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderLeft: item.pinned
                    ? '4px solid var(--ant-color-primary, #1677ff)'
                    : isRead
                      ? '4px solid transparent'
                      : '4px solid #52c41a',
                }}
                onClick={() => {
                  if (!isRead) onMarkRead(item.id);
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Header: Title, Tags, Date */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                    >
                      {!isRead ? (
                        <Badge dot status="processing" style={{ marginRight: 2 }} />
                      ) : null}
                      {item.pinned && (
                        <Tag color="red" icon={<PushpinFilled />} bordered={false}>
                          置顶
                        </Tag>
                      )}
                      <Tag color={tagProps.color} bordered={false}>
                        {tagProps.label}
                      </Tag>
                      <Title
                        level={5}
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: item.pinned || !isRead ? 600 : 500,
                        }}
                      >
                        {item.title}
                      </Title>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {formattedDate && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          <Space size={4}>
                            <CalendarOutlined />
                            <span>{formattedDate}</span>
                          </Space>
                        </Text>
                      )}
                      {!isRead && (
                        <Tag
                          color="green"
                          style={{ cursor: 'pointer', margin: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkRead(item.id);
                          }}
                        >
                          标记已读
                        </Tag>
                      )}
                    </div>
                  </div>

                  {/* Body Content */}
                  <div
                    style={{
                      background: 'var(--ant-color-fill-quaternary, rgba(0, 0, 0, 0.02))',
                      border: '1px solid var(--ant-color-border-secondary, rgba(0, 0, 0, 0.05))',
                      borderRadius: 8,
                      padding: '12px 16px',
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: 'var(--ant-color-text, inherit)',
                    }}
                  >
                    <Paragraph
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 14,
                        lineHeight: 1.7,
                      }}
                    >
                      {item.content}
                    </Paragraph>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
