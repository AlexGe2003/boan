import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';

const TITLE_KEYS: Record<string, string> = {
  '/': 'menu.dashboard',
  '/inbounds': 'menu.inbounds',
  '/clients': 'menu.clients',
  '/my-subscriptions': 'menu.mySubscriptions',
  '/announcements': 'menu.announcements',
  '/groups': 'menu.groups',
  '/nodes': 'menu.nodes',
  '/hosts': 'menu.hosts',
  '/settings': 'menu.settings',
  '/xray': 'menu.xray',
  '/outbound': 'menu.outbounds',
  '/routing': 'menu.routing',
  '/api-docs': 'menu.apiDocs',
};

export function usePageTitle() {
  const { pathname, hash } = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const key = TITLE_KEYS[pathname];
    const title =
      pathname === '/settings' && hash === '#administrators'
        ? '管理员账号'
        : pathname === '/support'
          ? '工单服务'
          : pathname === '/plans'
            ? '订阅套餐'
            : key
              ? t(key)
              : '3X-UI';
    const host = window.location.hostname;
    document.title = host ? `${host} - ${title}` : title;
  }, [pathname, hash, t]);
}
