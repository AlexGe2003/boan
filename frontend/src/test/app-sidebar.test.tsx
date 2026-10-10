import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';

import AppSidebar from '@/layouts/AppSidebar';
import { renderWithProviders } from './test-utils';

vi.mock('@/api/queries/useAllSettings', () => ({
  useAllSettings: () => ({ allSetting: {} }),
}));

afterEach(() => {
  localStorage.clear();
});

function renderSidebar() {
  return renderWithProviders(
    <MemoryRouter>
      <AppSidebar />
    </MemoryRouter>,
  );
}

test('keeps the sidebar expanded after pinning it from the header and restores the choice', () => {
  localStorage.setItem('sidebar-pinned', 'false');
  const first = renderSidebar();
  const sidebar = first.container.querySelector('.ant-layout-sider');
  const sidebarRoot = first.container.querySelector('.ant-sidebar');

  expect(sidebar?.classList.contains('ant-layout-sider-collapsed')).toBe(true);

  fireEvent.mouseEnter(sidebarRoot!);

  const pinButton = screen.getByRole('button', { name: 'Pin sidebar' });
  expect(pinButton.closest('.brand-actions')).not.toBeNull();

  fireEvent.click(pinButton);
  fireEvent.mouseLeave(sidebarRoot!);

  expect(sidebar?.classList.contains('ant-layout-sider-collapsed')).toBe(false);
  expect(sidebarRoot?.getAttribute('style')).toContain('--sider-rail: 240px');
  expect(localStorage.getItem('sidebar-pinned')).toBe('true');

  first.unmount();

  const second = renderSidebar();
  const restoredSidebar = second.container.querySelector('.ant-layout-sider');
  const restoredSidebarRoot = second.container.querySelector('.ant-sidebar');

  expect(restoredSidebar?.classList.contains('ant-layout-sider-collapsed')).toBe(false);
  expect(restoredSidebarRoot?.getAttribute('style')).toContain('--sider-rail: 240px');
  expect(screen.getByRole('button', { name: 'Pin sidebar' })).not.toBeNull();
});

test('returns to the compact rail after unpinning', () => {
  localStorage.setItem('sidebar-pinned', 'false');
  const view = renderSidebar();
  const sidebar = view.container.querySelector('.ant-layout-sider');
  const sidebarRoot = view.container.querySelector('.ant-sidebar');

  fireEvent.mouseEnter(sidebarRoot!);
  fireEvent.click(screen.getByRole('button', { name: 'Pin sidebar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pin sidebar' }));
  fireEvent.mouseLeave(sidebarRoot!);

  expect(sidebar?.classList.contains('ant-layout-sider-collapsed')).toBe(true);
  expect(sidebarRoot?.getAttribute('style')).toContain('--sider-rail: 72px');
  expect(localStorage.getItem('sidebar-pinned')).toBe('false');
});

test('reserves the expanded sidebar width so it cannot cover the header or content', () => {
  localStorage.setItem('sidebar-pinned', 'false');
  const view = renderSidebar();
  const root = view.container.querySelector('.ant-sidebar')!;
  const sidebar = view.container.querySelector('.ant-layout-sider')!;

  fireEvent.mouseEnter(root);
  expect(sidebar.classList.contains('ant-layout-sider-collapsed')).toBe(false);
  expect(root.getAttribute('style')).toContain('--sider-rail: 240px');

  fireEvent.mouseLeave(root);
  expect(sidebar.classList.contains('ant-layout-sider-collapsed')).toBe(true);
  expect(root.getAttribute('style')).toContain('--sider-rail: 72px');
});

test('labels the palette shortcut with the modifier the platform actually uses', () => {
  const view = renderSidebar();
  const chip = view.container.querySelector('.sidebar-command-kbd');
  expect(chip?.textContent).toBe('CtrlK');
});

test('opens with the full navigation for a new preference', () => {
  const view = renderSidebar();
  expect(
    view.container
      .querySelector('.ant-layout-sider')
      ?.classList.contains('ant-layout-sider-collapsed'),
  ).toBe(false);
  expect(view.container.querySelector('.ant-sidebar')?.getAttribute('style')).toContain(
    '--sider-rail: 240px',
  );
});
