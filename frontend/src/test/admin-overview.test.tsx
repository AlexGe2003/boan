import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test } from 'vitest';
import AdminOverview from '@/pages/index/AdminOverview';
import zhCN from '../../../internal/web/translation/zh-CN.json';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

afterEach(async () => {
  await i18next.changeLanguage('en-US');
});

test('renders AdminOverview tiles and shortcuts properly in Chinese', async () => {
  i18next.addResourceBundle('zh-CN', 'translation', zhCN, true, true);
  await i18next.changeLanguage('zh-CN');

  render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AdminOverview />
      </BrowserRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText(zhCN.adminOverview.title)).toBeTruthy();
  expect(screen.getByText(zhCN.adminOverview.users)).toBeTruthy();
  expect(screen.getByText(zhCN.adminOverview.nodes)).toBeTruthy();
  expect(screen.getAllByText(zhCN.adminOverview.inbounds).length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText(zhCN.adminOverview.xrayCore)).toBeTruthy();
  expect(screen.getByText(zhCN.adminOverview.shortcuts)).toBeTruthy();
});
