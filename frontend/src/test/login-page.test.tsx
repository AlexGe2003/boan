import { render, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import LoginPage from '@/pages/login/LoginPage';

test('renders redesigned console login page with brand header and compliance banner', async () => {
  render(<LoginPage />);

  expect(screen.getByText('Boan Console')).toBeTruthy();
  expect(screen.getByText('网络基础设施与订阅访问控制台')).toBeTruthy();
  expect(screen.getByText(/本服务仅面向海外合规业务部署/)).toBeTruthy();

  await waitFor(() => {
    expect(screen.getByPlaceholderText('请输入登录密码')).toBeTruthy();
  });

  expect(screen.getByRole('button', { name: /登录控制台/ })).toBeTruthy();
  expect(screen.getByText('服务协议')).toBeTruthy();
  expect(screen.getByText('合规声明')).toBeTruthy();
});
