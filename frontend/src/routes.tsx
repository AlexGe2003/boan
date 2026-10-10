import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { Spin } from 'antd';

import PanelLayout from '@/layouts/PanelLayout';
import RouteError from '@/components/RouteError';

const IndexPage = lazy(() => import('@/pages/index/IndexPage'));
const InboundsPage = lazy(() => import('@/pages/inbounds/InboundsPage'));
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'));
const SupportPage = lazy(() => import('@/pages/support/SupportPage'));
const BusinessPage = lazy(() => import('@/pages/business/BusinessPage'));
const PlansPage = lazy(() => import('@/pages/plans/PlansPage'));
const GroupsPage = lazy(() => import('@/pages/groups/GroupsPage'));
const NodesPage = lazy(() => import('@/pages/nodes/NodesPage'));
const HostsPage = lazy(() => import('@/pages/hosts/HostsPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const XrayPage = lazy(() => import('@/pages/xray/XrayPage'));
const ApiDocsPage = lazy(() => import('@/pages/api-docs/ApiDocsPage'));
const MySubscriptionsPage = lazy(() => import('@/pages/subscriptions/MySubscriptionsPage'));
const NodeMonitorPage = lazy(() => import('@/pages/nodes/NodeMonitorPage'));
const PanelUsersPage = lazy(() => import('@/pages/settings/PanelUsersPage'));
const AnnouncementsAdminPage = lazy(() => import('@/pages/announcements/AnnouncementsAdminPage'));

function withSuspense(node: React.ReactNode) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '60vh',
          }}
        >
          <Spin size="large" />
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: <PanelLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: withSuspense(<IndexPage />) },
      { path: 'inbounds', element: withSuspense(<InboundsPage />) },
      { path: 'clients', element: withSuspense(<ClientsPage />) },
      { path: 'my-subscriptions', element: withSuspense(<MySubscriptionsPage />) },
      { path: 'node-monitor', element: withSuspense(<NodeMonitorPage />) },
      { path: 'support', element: withSuspense(<SupportPage />) },
      { path: 'plans', element: withSuspense(<PlansPage />) },
      { path: 'announcements', element: withSuspense(<AnnouncementsAdminPage />) },
      { path: 'node-groups', element: withSuspense(<BusinessPage section="groups" />) },
      { path: 'orders', element: withSuspense(<BusinessPage section="orders" />) },
      { path: 'groups', element: withSuspense(<GroupsPage />) },
      { path: 'nodes', element: withSuspense(<NodesPage />) },
      { path: 'group-buy', element: <Navigate to="/nodes" replace /> },
      { path: 'hosts', element: withSuspense(<HostsPage />) },
      { path: 'settings', element: withSuspense(<SettingsPage />) },
      { path: 'users', element: withSuspense(<PanelUsersPage />) },
      { path: 'xray', element: withSuspense(<XrayPage />) },
      { path: 'outbound', element: withSuspense(<XrayPage />) },
      { path: 'routing', element: withSuspense(<XrayPage />) },
      { path: 'api-docs', element: withSuspense(<ApiDocsPage />) },
    ],
  },
];

function computeBasename() {
  const raw = (typeof window !== 'undefined' && window.X_UI_BASE_PATH) || '/';
  const trimmed = raw.replace(/\/+$/, '');
  return `${trimmed}/panel`;
}

export const router = createBrowserRouter(routes, {
  basename: computeBasename(),
});
