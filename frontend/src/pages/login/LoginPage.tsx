import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ConfigProvider, Form, Input, Modal, Spin, message, theme } from 'antd';
import { KeyOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';

import { FormProvider, useForm } from 'react-hook-form';
import { HttpUtil } from '@/utils';
import { FormField, rhfZodValidate } from '@/components/form/rhf';
import { setMessageInstance } from '@/utils/messageBus';
import earthImage from '@/assets/portal/earth-night.png';
import { GlobalOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { LoginFormSchema, TwoFactorCodeSchema, type LoginFormValues } from '@/schemas/login';
import './LoginPage.css';

type LoginForm = LoginFormValues;

const basePath = window.X_UI_BASE_PATH || '/';

export default function LoginPage() {
  const [messageApi, messageContextHolder] = message.useMessage();

  useEffect(() => {
    setMessageInstance(messageApi);
  }, [messageApi]);

  const [help, setHelp] = useState<'password' | 'account' | null>(null);
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
          <a className="portal-brand" href={basePath}>
            <GlobalOutlined /> BOAN <span>泊岸网络</span>
          </a>
          <div className="login-card">
            <h1>登录您的账户</h1>
            <p className="login-subtitle">连接更广阔的世界，从这里开始。</p>
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
                      label="管理员双重验证码"
                      rules={{
                        validate: (value) => !value || rhfZodValidate(TwoFactorCodeSchema)(value),
                      }}
                    >
                      <Input
                        prefix={<KeyOutlined />}
                        autoComplete="one-time-code"
                        size="large"
                        placeholder="订阅用户可留空"
                      />
                    </FormField>
                  )}

                  <div className="login-options">
                    <span>使用您的订阅账号登录</span>
                    <button type="button" onClick={() => setHelp('password')}>
                      忘记密码？
                    </button>
                  </div>
                  <Form.Item className="submit-row">
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
            <button className="login-account-help" type="button" onClick={() => setHelp('account')}>
              还没有账号？了解如何开通
            </button>
            <p className="login-help">管理员使用管理账号登录后进入管理后台。</p>
            <a className="login-back" href={basePath}>
              <ArrowLeftOutlined /> 返回首页
            </a>
          </div>
          <footer>© {new Date().getFullYear()} BOAN · 泊岸网络</footer>
        </section>
        <section
          className="login-visual"
          style={{ backgroundImage: `url(${earthImage})` }}
          aria-label="地球夜景"
        ></section>
      </main>
      <Modal
        open={help !== null}
        title={help === 'password' ? '忘记密码' : '开通订阅账号'}
        onCancel={() => setHelp(null)}
        footer={
          <Button type="primary" onClick={() => setHelp(null)}>
            返回登录
          </Button>
        }
      >
        <div className="login-help-content">
          {help === 'password' ? (
            <>
              <p>订阅账号目前由管理员维护，找回密码需要管理员协助。</p>
              <ol>
                <li>联系为您开通账号的服务管理员，提供登录用户名。</li>
                <li>按管理员要求核对账号归属，无需提供原密码。</li>
                <li>管理员重置后，使用新密码返回此页登录。</li>
              </ol>
              <p>
                如果忘记的是后台管理员密码，请联系系统部署负责人处理。当前尚未提供邮件自助重置。
              </p>
            </>
          ) : (
            <p>请联系服务管理员选择套餐并开通账号，取得用户名和密码后即可登录查看流量与订阅。</p>
          )}
        </div>
      </Modal>
    </ConfigProvider>
  );
}
