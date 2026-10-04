import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ConfigProvider, Form, Input, Spin, message, theme } from 'antd';
import { KeyOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';

import { FormProvider, useForm } from 'react-hook-form';
import { HttpUtil } from '@/utils';
import { FormField, rhfZodValidate } from '@/components/form/rhf';
import { setMessageInstance } from '@/utils/messageBus';
import earthImage from '@/assets/portal/earth-night.png';
import { LoginFormSchema, TwoFactorCodeSchema, type LoginFormValues } from '@/schemas/login';
import './LoginPage.css';

type LoginForm = LoginFormValues;

const basePath = window.X_UI_BASE_PATH || '/';

export default function LoginPage() {
  const [messageApi, messageContextHolder] = message.useMessage();

  useEffect(() => {
    setMessageInstance(messageApi);
  }, [messageApi]);

  const [initError, setInitError] = useState('');
  const [initAttempt, setInitAttempt] = useState(0);
  const [fetched, setFetched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [twoFactorEnable, setTwoFactorEnable] = useState(false);
  const methods = useForm<LoginForm>({
    defaultValues: { username: '', password: '', twoFactorCode: '' },
  });

  useEffect(() => {
    document.documentElement.lang = 'zh-CN';
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetched(false);
      setInitError('');
      try {
        const msg = await HttpUtil.post('/getTwoFactorEnable');
        if (!msg.success) throw new Error(msg.msg || '无法连接登录服务');
        if (!cancelled) setTwoFactorEnable(!!msg.obj);
      } catch (error) {
        if (!cancelled) setInitError(error instanceof Error ? error.message : '无法连接登录服务');
      } finally {
        if (!cancelled) setFetched(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initAttempt]);

  const onSubmit = useCallback(async (values: LoginForm) => {
    setSubmitting(true);
    try {
      const msg = await HttpUtil.post('/login', values);
      if (msg.success) {
        const session = msg.obj as {
          role?: string;
          roleKey?: string;
          pages?: string[];
        } | null;
        const firstPage = session?.pages?.[0] ?? '/';
        window.location.href =
          basePath +
          (session?.role === 'user'
            ? session.roleKey === 'user'
              ? 'panel/my-subscriptions'
              : `panel${firstPage}`
            : 'panel/');
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#1e5eff', borderRadius: 6 },
      }}
    >
      {messageContextHolder}
      <main className="login-app">
        <section className="login-panel">
          <div className="login-card">
            <h1>登录您的账户</h1>
            <p className="login-subtitle">请输入用户名与密码以继续</p>
            {initError && (
              <Alert
                type="error"
                title="登录服务暂不可用"
                description={initError}
                action={<Button onClick={() => setInitAttempt((value) => value + 1)}>重试</Button>}
              />
            )}
            {!fetched ? (
              <Spin />
            ) : (
              <FormProvider {...methods}>
                <Form
                  layout="vertical"
                  className="login-form"
                  onFinish={methods.handleSubmit(onSubmit)}
                >
                  <FormField
                    name="username"
                    label="用户名"
                    rules={{
                      validate: rhfZodValidate(LoginFormSchema.shape.username),
                    }}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      autoComplete="username"
                      size="large"
                      placeholder="用户名"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoFocus={!window.matchMedia('(pointer: coarse)').matches}
                    />
                  </FormField>

                  <FormField
                    name="password"
                    label="密码"
                    rules={{
                      validate: rhfZodValidate(LoginFormSchema.shape.password),
                    }}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      autoComplete="current-password"
                      size="large"
                      placeholder="密码"
                    />
                  </FormField>

                  {twoFactorEnable && (
                    <FormField
                      name="twoFactorCode"
                      label="双重验证码"
                      rules={{
                        validate: (value) => !value || rhfZodValidate(TwoFactorCodeSchema)(value),
                      }}
                    >
                      <Input
                        prefix={<KeyOutlined />}
                        autoComplete="one-time-code"
                        size="large"
                        placeholder="请输入双重验证码"
                      />
                    </FormField>
                  )}

                  <Form.Item className="submit-row" style={{ marginTop: 24 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={submitting}
                      disabled={submitting || !!initError}
                      size="large"
                      block
                    >
                      {submitting ? '正在登录…' : '登录'}
                    </Button>
                  </Form.Item>
                </Form>
              </FormProvider>
            )}
          </div>
          <footer>© {new Date().getFullYear()}</footer>
        </section>
        <section
          className="login-visual"
          style={{ backgroundImage: `url(${earthImage})` }}
          aria-label="地球夜景"
        ></section>
      </main>
    </ConfigProvider>
  );
}
