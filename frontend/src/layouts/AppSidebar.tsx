import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button, Drawer, Layout, Menu, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  CloseOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  CodeOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DiscordOutlined,
  ExportOutlined,
  GithubOutlined,
  GlobalOutlined,
  ImportOutlined,
  LogoutOutlined,
  MailOutlined,
  ReloadOutlined,
  MessageOutlined,
  NotificationOutlined,
  MoonFilled,
  MoonOutlined,
  PushpinFilled,
  PushpinOutlined,
  SafetyOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';

import { useQueryClient } from '@tanstack/react-query';
import PanelTopbar from './PanelTopbar';
import { HttpUtil } from '@/utils';
import { formatPanelVersion } from '@/lib/panel-version';
import { pauseAnimationsUntilLeave, useTheme } from '@/hooks/useTheme';
import { useAllSettings } from '@/api/queries/useAllSettings';
import { useCommandPalette } from '@/components/command-palette/useCommandPalette';
import { usePanelAccess } from '@/api/queries/usePanelRole';
import { visibleNavKeys } from '@/layouts/nav-role';
import './AppSidebar.css';

// The palette listens for Ctrl as well as Cmd, so the chip must not show a
// Mac glyph to the Linux and Windows operators who are most of this panel's.
const SHORTCUT_MODIFIER = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? '⌘' : 'Ctrl';
const REPO_URL = 'https://github.com/MHSanaei/3x-ui';
const LOGOUT_KEY = '__logout__';
const RAIL_WIDTH = 72;
const SIDER_WIDTH = 240;
const SIDEBAR_PINNED_KEY = 'sidebar-pinned';

let hoveredAcrossRemounts = false;

type IconName =
  | 'dashboard'
  | 'inbound'
  | 'team'
  | 'groups'
  | 'announcement'
  | 'setting'
  | 'tool'
  | 'cluster'
  | 'hosts'
  | 'logout'
  | 'apidocs'
  | 'outbound'
  | 'routing';

const iconByName: Record<IconName, ComponentType> = {
  dashboard: DashboardOutlined,
  inbound: ImportOutlined,
  team: TeamOutlined,
  groups: TagsOutlined,
  announcement: NotificationOutlined,
  setting: SettingOutlined,
  tool: ToolOutlined,
  cluster: ClusterOutlined,
  hosts: GlobalOutlined,
  logout: LogoutOutlined,
  apidocs: ApiOutlined,
  outbound: ExportOutlined,
  routing: SwapOutlined,
};

function VersionBadge({ version, collapsed }: { version: string; collapsed?: boolean }) {
  if (!version) return null;
  const label = formatPanelVersion(version);
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="sider-version"
      aria-label={`GitHub ${label}`}
      title={label}
    >
      <GithubOutlined />
      {!collapsed && <span className="sider-version-text">{label}</span>}
    </a>
  );
}

function ThemeCycleButton({
  id,
  isDark,
  isUltra,
  onCycle,
  ariaLabel,
}: {
  id: string;
  isDark: boolean;
  isUltra: boolean;
  onCycle: () => void;
  ariaLabel: string;
}) {
  const icon = !isDark ? <SunOutlined /> : !isUltra ? <MoonOutlined /> : <MoonFilled />;
  return (
    <button
      id={id}
      type="button"
      className="sidebar-theme-cycle"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onCycle}
    >
      {icon}
    </button>
  );
}

function readSidebarPinned() {
  try {
    return localStorage.getItem(SIDEBAR_PINNED_KEY) !== 'false';
  } catch {
    return false;
  }
}

function saveSidebarPinned(pinned: boolean) {
  try {
    localStorage.setItem(SIDEBAR_PINNED_KEY, String(pinned));
  } catch {}
}

export default function AppSidebar() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isDark, isUltra, toggleTheme, toggleUltra } = useTheme();
  const { open: openCommandPalette } = useCommandPalette();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const access = usePanelAccess();
  const { allSetting } = useAllSettings();
  const showSubFormats = !!(allSetting.subJsonEnable || allSetting.subClashEnable);
  const showSubBalancers = !!allSetting.subJsonEnable;

  const [hovered, setHovered] = useState(() => hoveredAcrossRemounts);
  const [pinned, setPinned] = useState(readSidebarPinned);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1025px)');
    const closeMobileDrawer = () => {
      if (desktop.matches) setDrawerOpen(false);
    };
    desktop.addEventListener('change', closeMobileDrawer);
    return () => desktop.removeEventListener('change', closeMobileDrawer);
  }, []);
  const railCollapsed = !hovered && !pinned;
  const railStyle = useMemo(
    () => ({ '--sider-rail': `${pinned ? SIDER_WIDTH : RAIL_WIDTH}px` }) as CSSProperties,
    [pinned],
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const updateHovered = useCallback((value: boolean) => {
    hoveredAcrossRemounts = value;
    setHovered(value);
  }, []);

  const togglePinned = useCallback(() => {
    const next = !pinned;
    saveSidebarPinned(next);
    setPinned(next);
    if (!next) {
      updateHovered(false);
    }
  }, [pinned, updateHovered]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const el = rootRef.current;
      if (el) updateHovered(el.matches(':hover'));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [updateHovered]);

  const currentTheme: 'light' | 'dark' = isDark ? 'dark' : 'light';
  const panelVersion = window.X_UI_CUR_VER || '';

  const tabs = useMemo<{ key: string; icon: IconName; title: string }[]>(
    () => [
      {
        key: '/',
        icon: 'dashboard',
        title: access.role === 'admin' ? t('adminOverview.title') : t('menu.dashboard'),
      },
      { key: '/inbounds', icon: 'inbound', title: t('menu.inbounds') },
      { key: '/clients', icon: 'team', title: t('menu.clients') },
      { key: '/plans', icon: 'groups', title: t('menu.nodePlans') },
      { key: '/announcements', icon: 'announcement', title: t('menu.announcements') },
      { key: '/my-subscriptions', icon: 'team', title: t('menu.mySubscriptions') },
      { key: '/node-monitor', icon: 'cluster', title: t('nodeMonitor.title') },
      { key: '/node-groups', icon: 'cluster', title: '节点分组' },
      { key: '/groups', icon: 'groups', title: t('menu.groups') },
      { key: '/nodes', icon: 'cluster', title: t('menu.nodes') },
      { key: '/hosts', icon: 'hosts', title: t('menu.hosts') },
      { key: '/outbound', icon: 'outbound', title: t('menu.outbounds') },
      { key: '/routing', icon: 'routing', title: t('menu.routing') },
      { key: '/settings', icon: 'setting', title: t('menu.settings') },
      { key: '/xray', icon: 'tool', title: t('menu.xray') },
      { key: '/api-docs', icon: 'apidocs', title: t('menu.apiDocs') },
      { key: LOGOUT_KEY, icon: 'logout', title: t('logout') },
    ],
    [t, access.role],
  );

  const shownTabs = useMemo(
    () =>
      tabs.filter((tab) => visibleNavKeys(access.role, [tab.key], access.pages).includes(tab.key)),
    [tabs, access.role, access.pages],
  );
  const navItems = useMemo(() => shownTabs.filter((tab) => tab.icon !== 'logout'), [shownTabs]);
  const utilItems = useMemo(() => shownTabs.filter((tab) => tab.icon === 'logout'), [shownTabs]);

  const settingsChildren = useMemo<NonNullable<MenuProps['items']>>(() => {
    const children: NonNullable<MenuProps['items']> = [
      {
        key: '/settings#general',
        icon: <SettingOutlined />,
        label: t('pages.settings.panelSettings'),
      },
      {
        key: '/settings#security',
        icon: <SafetyOutlined />,
        label: t('pages.settings.securitySettings'),
      },
      {
        key: '/settings#telegram',
        icon: <MessageOutlined />,
        label: t('pages.settings.TGBotSettings'),
      },
      { key: '/settings#email', icon: <MailOutlined />, label: t('pages.settings.emailSettings') },
      {
        key: '/settings#discord',
        icon: <DiscordOutlined />,
        label: t('pages.settings.discordSettings'),
      },
      {
        key: '/settings#subscription',
        icon: <CloudServerOutlined />,
        label: t('pages.settings.subSettings'),
      },
    ];
    if (access.role === 'admin')
      children.splice(2, 0, {
        key: '/settings#administrators',
        icon: <TeamOutlined />,
        label: '管理员账号',
      });
    if (showSubFormats) {
      children.push({
        key: '/settings#subscription-formats',
        icon: <CodeOutlined />,
        label: t('menu.subFormats'),
      });
    }
    if (showSubBalancers) {
      children.push({
        key: '/settings#subscription-balancers',
        icon: <ApartmentOutlined />,
        label: t('pages.settings.subBalancers.menu'),
      });
    }
    return children;
  }, [t, showSubFormats, showSubBalancers, access.role]);

  const xrayChildren = useMemo<NonNullable<MenuProps['items']>>(
    () => [
      { key: '/xray#basic', icon: <SettingOutlined />, label: t('pages.xray.basicTemplate') },
      { key: '/xray#balancer', icon: <ClusterOutlined />, label: t('pages.xray.Balancers') },
      { key: '/xray#dns', icon: <DatabaseOutlined />, label: 'DNS' },
      { key: '/xray#advanced', icon: <CodeOutlined />, label: t('pages.xray.advancedTemplate') },
    ],
    [t],
  );

  const settingsActive = pathname === '/settings';
  const xrayActive = pathname === '/xray';
  const selectedKey = settingsActive
    ? `/settings${hash || '#general'}`
    : xrayActive
      ? `/xray${hash || '#basic'}`
      : pathname === ''
        ? '/'
        : pathname;

  const openSubmenu = settingsActive ? '/settings' : xrayActive ? '/xray' : null;
  const [openKeys, setOpenKeys] = useState<string[]>(() => (openSubmenu ? [openSubmenu] : []));
  if (openSubmenu && !openKeys.includes(openSubmenu)) {
    setOpenKeys([...openKeys, openSubmenu]);
  }

  const toMenuItems = useCallback(
    (items: typeof tabs): MenuProps['items'] =>
      items.map((tab) => {
        const Icon = iconByName[tab.icon];
        if (tab.key === '/settings') {
          return { key: tab.key, icon: <Icon />, label: tab.title, children: settingsChildren };
        }
        if (tab.key === '/xray') {
          return { key: tab.key, icon: <Icon />, label: tab.title, children: xrayChildren };
        }
        return { key: tab.key, icon: <Icon />, label: tab.title, title: '' };
      }),
    [settingsChildren, xrayChildren],
  );

  const groupedNavItems = useMemo<MenuProps['items']>(() => {
    if (access.role !== 'admin') return toMenuItems(navItems);
    const sections = [
      {
        name: 'operations',
        label: t('adminOverview.operations'),
        keys: ['/', '/clients', '/plans', '/orders', '/support', '/groups'],
      },
      {
        name: 'infrastructure',
        label: t('adminOverview.infrastructure'),
        keys: ['/node-monitor', '/inbounds', '/hosts', '/nodes'],
      },
      {
        name: 'advancedNetwork',
        label: t('adminOverview.advancedNetwork'),
        keys: ['/node-groups', '/outbound', '/routing'],
      },
      {
        name: 'system',
        label: t('adminOverview.system'),
        keys: ['/settings', '/xray', '/api-docs'],
      },
    ];
    return sections.map((section) => ({
      type: 'group',
      key: section.name,
      label: section.label,
      children: toMenuItems(
        section.keys.flatMap((key) => navItems.filter((item) => item.key === key)),
      ),
    }));
  }, [access.role, navItems, toMenuItems, t]);

  const openLink = useCallback(
    async (key: string) => {
      if (key === LOGOUT_KEY) {
        await HttpUtil.post('/logout');
        window.location.href = window.X_UI_BASE_PATH || '/';
        return;
      }
      navigate(key);
    },
    [navigate],
  );

  const onMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(
    ({ key }) => {
      openLink(String(key));
    },
    [openLink],
  );

  const cycleTheme = useCallback(
    (id: string) => {
      pauseAnimationsUntilLeave(id);
      if (!isDark) {
        toggleTheme();
        if (isUltra) toggleUltra();
      } else if (!isUltra) {
        toggleUltra();
      } else {
        toggleUltra();
        toggleTheme();
      }
    },
    [isDark, isUltra, toggleTheme, toggleUltra],
  );

  return (
    <div
      ref={rootRef}
      className={`ant-sidebar${pinned ? ' sidebar-pinned' : ''}`}
      style={railStyle}
      onMouseEnter={(event) => {
        if (!(event.target instanceof Element && event.target.closest('.panel-topbar')))
          updateHovered(true);
      }}
      onMouseLeave={(event) => {
        const related = event.relatedTarget;
        if (
          related instanceof Element &&
          (related.closest('.ant-menu-submenu-popup') || related.closest('.ant-tooltip'))
        ) {
          return;
        }
        updateHovered(false);
      }}
    >
      <Layout.Sider
        theme={currentTheme}
        width={SIDER_WIDTH}
        collapsedWidth={RAIL_WIDTH}
        collapsed={railCollapsed}
      >
        <div className="sider-brand">
          <CloudServerOutlined className="sidebar-brand-icon" aria-hidden="true" />
          {!railCollapsed && (
            <strong className="sidebar-brand-name">{t('adminOverview.admin')}</strong>
          )}
          {!railCollapsed && (
            <div className="brand-actions">
              <button
                type="button"
                className="sidebar-pin"
                aria-label={t('menu.pinSidebar')}
                aria-pressed={pinned}
                title={t(pinned ? 'menu.unpinSidebar' : 'menu.pinSidebar')}
                onClick={togglePinned}
              >
                {pinned ? <PushpinFilled /> : <PushpinOutlined />}
              </button>
              <ThemeCycleButton
                id="theme-cycle"
                isDark={isDark}
                isUltra={isUltra}
                onCycle={() => cycleTheme('theme-cycle')}
                ariaLabel={t('menu.theme')}
              />
            </div>
          )}
        </div>
        <Tooltip
          title={
            railCollapsed ? t('commandPalette.title') || 'Command Palette (Ctrl + K)' : undefined
          }
          placement="right"
        >
          <button
            type="button"
            className={`sidebar-command-trigger${railCollapsed ? ' collapsed' : ''}`}
            onClick={openCommandPalette}
            aria-label={t('commandPalette.title') || 'Command Palette (Ctrl + K)'}
          >
            <span className="sidebar-command-left">
              <SearchOutlined className="sidebar-command-icon" />
              <span className="sidebar-command-text">
                {t('commandPalette.search') || 'Search...'}
              </span>
            </span>
            <span className="sidebar-command-kbd">
              <span className="kbd-cmd">{SHORTCUT_MODIFIER}</span>
              <span className="kbd-key">K</span>
            </span>
          </button>
        </Tooltip>
        <Menu
          theme={currentTheme}
          mode="inline"
          inlineCollapsed={railCollapsed}
          selectedKeys={[selectedKey]}
          openKeys={railCollapsed ? undefined : openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          className="sider-nav"
          items={groupedNavItems}
          onClick={onMenuClick}
        />
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[selectedKey]}
          className="sider-utility"
          items={toMenuItems(utilItems)}
          onClick={onMenuClick}
        />
        <div className="sider-footer">
          <VersionBadge version={panelVersion} collapsed={railCollapsed} />
        </div>
      </Layout.Sider>

      <Drawer
        placement="left"
        closable={false}
        open={drawerOpen}
        rootClassName={`panel-navigation-drawer ${currentTheme}`}
        size="min(82vw, 240px)"
        styles={{
          wrapper: { padding: 0 },
          body: {
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          },
          header: { display: 'none' },
        }}
        onClose={() => setDrawerOpen(false)}
      >
        <div className="drawer-header">
          <strong className="sidebar-brand-name">{t('adminOverview.admin')}</strong>
          <div className="drawer-header-actions">
            <ThemeCycleButton
              id="theme-cycle-drawer"
              isDark={isDark}
              isUltra={isUltra}
              onCycle={() => cycleTheme('theme-cycle-drawer')}
              ariaLabel={t('menu.theme')}
            />
            <button
              className="drawer-close"
              type="button"
              aria-label={t('close')}
              onClick={() => setDrawerOpen(false)}
            >
              <CloseOutlined />
            </button>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-command-trigger"
          onClick={() => {
            setDrawerOpen(false);
            openCommandPalette();
          }}
          aria-label={t('commandPalette.title') || 'Command Palette (Ctrl + K)'}
          style={{ margin: '8px 12px 4px', width: 'calc(100% - 24px)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SearchOutlined className="sidebar-command-icon" />
            <span>{t('commandPalette.search') || 'Search...'}</span>
          </span>
          <span className="sidebar-command-kbd">
            <span className="kbd-cmd">{SHORTCUT_MODIFIER}</span>
            <span className="kbd-key">K</span>
          </span>
        </button>
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          className="drawer-menu drawer-nav"
          items={groupedNavItems}
          onClick={(info) => {
            onMenuClick(info);
            setDrawerOpen(false);
          }}
        />
        <Menu
          theme={currentTheme}
          mode="inline"
          selectedKeys={[selectedKey]}
          className="drawer-menu drawer-utility"
          items={toMenuItems(utilItems)}
          onClick={(info) => {
            onMenuClick(info);
            setDrawerOpen(false);
          }}
        />
        <div className="drawer-footer">
          <VersionBadge version={panelVersion} />
        </div>
      </Drawer>

      <PanelTopbar
        fixed
        title={navItems.find((item) => item.key === selectedKey)?.title || t('menu.dashboard')}
        identity={access.role === 'admin' ? '管理员' : '用户'}
        onMenu={() => setDrawerOpen(true)}
        actions={
          <>
            <Button
              type="text"
              aria-label="刷新页面数据"
              icon={<ReloadOutlined />}
              onClick={() => void queryClient.refetchQueries({ type: 'active' })}
            />
            <Button
              type="text"
              aria-label={t('logout')}
              icon={<LogoutOutlined />}
              onClick={() => void openLink(LOGOUT_KEY)}
            />
          </>
        }
      />
    </div>
  );
}
