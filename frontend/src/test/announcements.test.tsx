import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import AnnouncementModal from '@/pages/subscriptions/AnnouncementModal';
import AnnouncementsView from '@/pages/subscriptions/AnnouncementsView';
import type { Announcement } from '@/models/announcement';

const mockAnnouncements: Announcement[] = [
  {
    id: 1,
    title: '网络维护通知',
    content: '节点将于凌晨进行核心优化。',
    tag: 'maintenance',
    popup: true,
    pinned: true,
    enabled: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 2,
    title: '新功能发布',
    content: '全新用户中心上线，支持公告查看与用量明细。',
    tag: 'feature',
    popup: false,
    pinned: false,
    enabled: true,
    createdAt: 1700001000000,
    updatedAt: 1700001000000,
  },
];

describe('AnnouncementModal', () => {
  test('renders announcement title and content and fires acknowledge callback', () => {
    const handleAcknowledge = vi.fn();
    render(
      <AnnouncementModal
        open={true}
        announcement={mockAnnouncements[0]}
        onAcknowledge={handleAcknowledge}
      />,
    );

    expect(screen.getByText('网络维护通知')).toBeDefined();
    expect(screen.getByText('节点将于凌晨进行核心优化。')).toBeDefined();

    const ackButton = screen.getByRole('button', { name: /我知道了/i });
    fireEvent.click(ackButton);
    expect(handleAcknowledge).toHaveBeenCalledWith(1);
  });
});

describe('AnnouncementsView', () => {
  test('renders announcements list and filters by keyword and tag', () => {
    const handleMarkRead = vi.fn();
    const handleMarkAllRead = vi.fn();

    render(
      <AnnouncementsView
        announcements={mockAnnouncements}
        readIds={[1]}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
      />,
    );

    expect(screen.getByText('网络维护通知')).toBeDefined();
    expect(screen.getByText('新功能发布')).toBeDefined();

    // Search filter
    const searchInput = screen.getByPlaceholderText('搜索公告标题或内容...');
    fireEvent.change(searchInput, { target: { value: '核心优化' } });
    expect(screen.getByText('网络维护通知')).toBeDefined();
    expect(screen.queryByText('新功能发布')).toBeNull();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('新功能发布')).toBeDefined();

    // Mark as read click
    const markReadTag = screen.getByText('标记已读');
    fireEvent.click(markReadTag);
    expect(handleMarkRead).toHaveBeenCalledWith(2);
  });
});
