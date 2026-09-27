import { createRoot } from 'react-dom/client';
import { message } from 'antd';
import 'antd/dist/reset.css';

import { setupHttp } from '@/api/http-init';
import { CookieManager } from '@/utils';
import { readyI18n } from '@/i18n/react';
import { ThemeProvider } from '@/hooks/useTheme';
import { QueryProvider } from '@/api/QueryProvider';
import LoginPage from '@/pages/login/LoginPage';
import LandingPage from '@/pages/login/LandingPage';

document.title = window.location.pathname.endsWith('/login')
  ? '登录 · BOAN 泊岸网络'
  : 'BOAN 泊岸网络';
setupHttp();
CookieManager.setCookie('lang', 'zh-CN', 365);

const messageContainer = document.getElementById('message');
if (messageContainer) {
  message.config({ getContainer: () => messageContainer });
}

readyI18n().then(() => {
  const root = document.getElementById('app');
  if (root) {
    createRoot(root).render(
      <ThemeProvider>
        <QueryProvider>
          {window.location.pathname.replace(/\/$/, '').endsWith('/login') ||
          window.location.pathname.endsWith('/login.html') ? (
            <LoginPage />
          ) : (
            <LandingPage />
          )}
        </QueryProvider>
      </ThemeProvider>,
    );
  }
});
