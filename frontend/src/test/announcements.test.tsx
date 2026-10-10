import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import AnnouncementModal from '@/pages/subscriptions/AnnouncementModal';
import AnnouncementsView from '@/pages/subscriptions/AnnouncementsView';
import type { Announcement } from '@/models/announcement';
import MySubscriptionsPage from '@/pages/subscriptions/MySubscriptionsPage';
import { HttpUtil, Msg } from '@/utils';
import { makeTestQueryClient, renderWithProviders } from './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

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

test('keeps announcement read status separate when the signed-in account changes', async () => {
  const queryClient = makeTestQueryClient();
  const access = { userId: 7, role: 'user', roleKey: 'customer', pages: [] };
  queryClient.setQueryData(['session', 'access'], access);
  vi.spyOn(HttpUtil, 'get').mockImplementation(
    async (url) => new Msg(true, '', url.includes('/announcements') ? mockAnnouncements : []),
  );
  localStorage.setItem('boan_read_announcements', '[1,2]');
  renderWithProviders(
    <MemoryRouter initialEntries={['/panel/my-subscriptions#announcements']}>
      <MySubscriptionsPage />
    </MemoryRouter>,
    { queryClient },
  );
  fireEvent.click(await screen.findByRole('button', { name: /我知道了/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(localStorage.getItem('boan_read_announcements:7')).toBe('[1]');
  expect(screen.getAllByRole('button', { name: '刷新信息' })).toHaveLength(1);
  expect(screen.queryByTitle('刷新公告')).toBeNull();

  act(() => queryClient.setQueryData(['session', 'access'], { ...access, userId: 8 }));
  expect(await screen.findByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /我知道了/ }));
  expect(localStorage.getItem('boan_read_announcements:8')).toBe('[1]');
});

test('ignores malformed stored announcement read state', async () => {
  const queryClient = makeTestQueryClient();
  queryClient.setQueryData(['session', 'access'], {
    userId: 9,
    role: 'user',
    roleKey: 'customer',
    pages: [],
  });
  localStorage.setItem('boan_read_announcements:9', '{"unexpected":true}');
  vi.spyOn(HttpUtil, 'get').mockImplementation(
    async (url) => new Msg(true, '', url.includes('/announcements') ? mockAnnouncements : []),
  );
  renderWithProviders(
    <MemoryRouter>
      <MySubscriptionsPage />
    </MemoryRouter>,
    { queryClient },
  );
  expect(await screen.findByRole('dialog')).toBeTruthy();
});
