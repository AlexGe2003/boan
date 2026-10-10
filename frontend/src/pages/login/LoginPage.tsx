import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  Form,
  Input,
  Modal,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  message,
  theme,
} from 'antd';
import {
  KeyOutlined,
  LockOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  QuestionCircleOutlined,
  CheckCircleFilled,
  WarningFilled,
  CloudServerOutlined,
  ThunderboltFilled,
  GlobalOutlined,
  LaptopOutlined,
  FileProtectOutlined,
} from '@ant-design/icons';

import { FormProvider, useForm } from 'react-hook-form';
import { HttpUtil } from '@/utils';
import { FormField, rhfZodValidate } from '@/components/form/rhf';
import { setMessageInstance } from '@/utils/messageBus';
import earthImage from '@/assets/portal/earth-night.png';
import { LoginFormSchema, TwoFactorCodeSchema, type LoginFormValues } from '@/schemas/login';
import './LoginPage.css';

type LoginForm = LoginFormValues;

const basePath = window.X_UI_BASE_PATH || '/';
const SAVED_USERNAME_KEY = 'boan_saved_username';
const REMEMBER_ME_KEY = 'boan_remember_me';
const AGREED_TERMS_KEY = 'boan_agreed_terms';

export default function LoginPage() {
  const [messageApi, messageContextHolder] = message.useMessage();

  useEffect(() => {
    setMessageInstance(messageApi);
  }, [messageApi]);

  const [initError, setInitError] = useState('');
  const [initAttempt, setInitAttempt] = useState(0);
  const [fetched, setFetched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [twoFactorEnable, setTwoFactorEnable] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementTab, setAgreementTab] = useState<'terms' | 'privacy' | 'compliance'>('terms');

  const [agreedTerms, setAgreedTerms] = useState(() => {
    return localStorage.getItem(AGREED_TERMS_KEY) !== 'false';
  });

  const openAgreement = (tab: 'terms' | 'privacy' | 'compliance') => {
    setAgreementTab(tab);
    setAgreementOpen(true);
  };

  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
  });

  const savedUsername = localStorage.getItem(SAVED_USERNAME_KEY) || '';

  const methods = useForm<LoginForm>({
    defaultValues: {
      username: savedUsername,
      password: '',
      twoFactorCode: '',
    },
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

  const handlePasswordKeyEvent = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const onSubmit = useCallback(
    async (values: LoginForm) => {
      if (!agreedTerms) {
        messageApi.warning('请先阅读并同意《用户服务协议》与《隐私保护政策》');
        return;
      }
      setSubmitting(true);
      setLoginError('');
      try {
        if (rememberMe) {
          localStorage.setItem(SAVED_USERNAME_KEY, values.username);
          localStorage.setItem(REMEMBER_ME_KEY, 'true');
        } else {
          localStorage.removeItem(SAVED_USERNAME_KEY);
          localStorage.setItem(REMEMBER_ME_KEY, 'false');
        }
        localStorage.setItem(AGREED_TERMS_KEY, 'true');

        const msg = await HttpUtil.post('/login', values);
        if (msg.success) {
          setLoginSuccess(true);
          const session = msg.obj as {
            role?: string;
            roleKey?: string;
            pages?: string[];
          } | null;
          const firstPage = session?.pages?.[0] ?? '/';
          setTimeout(() => {
            window.location.href =
              basePath +
              (session?.role === 'user'
                ? session.roleKey === 'user'
                  ? 'panel/my-subscriptions'
                  : `panel${firstPage}`
                : 'panel/');
          }, 350);
        } else {
          setLoginError(msg.msg || '登录失败，请检查账号与密码');
        }
      } catch (err) {
        setLoginError(err instanceof Error ? err.message : '连接服务器失败，请稍后重试');
      } finally {
        setSubmitting(false);
      }
    },
    [agreedTerms, messageApi, rememberMe],
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3b82f6',
          borderRadius: 10,
          colorBgContainer: 'rgba(255, 255, 255, 0.04)',
          colorBorder: 'rgba(255, 255, 255, 0.12)',
        },
      }}
    >
      {messageContextHolder}
      <main className="login-app">
        <section className="login-panel">
          <div className="login-brand-bar">
            <div className="portal-brand">
              <div className="brand-logo-icon">
                <SafetyCertificateOutlined />
              </div>
              <div className="brand-text-wrap">
                <strong className="brand-title">Boan</strong>
                <span className="brand-badge">用户中心</span>
              </div>
              <div className="login-service-status-pill">
                <span className="service-status-dot" />
                <span>服务正常</span>
              </div>
            </div>
            <div className="login-top-actions">
              <button
                type="button"
                className="login-help-trigger"
                onClick={() => setHelpOpen(true)}
                aria-label="查看登录帮助"
              >
                <QuestionCircleOutlined />
                <span>登录帮助</span>
              </button>
            </div>
          </div>

          <div className="login-card">
            <div className="login-header">
              <h1>欢迎登录</h1>
              <p className="login-subtitle">请使用您的专属账户登录控制台或订阅中心</p>
            </div>

            <div className="login-geo-notice" role="note">
              <GlobalOutlined className="geo-icon" aria-hidden="true" />
              <div className="geo-notice-text">
                <strong>服务地域与免责声明：</strong>
                <span>
                  本服务仅面向海外合规用户，<strong>不保证大陆优化</strong>，
                  <strong>不支持中国大陆及中国境内用户</strong>。
                </span>
              </div>
            </div>

            {initError && (
              <Alert
                type="error"
                showIcon
                className="login-alert"
                title="登录服务连接失败"
                description={initError}
                action={
                  <Button size="small" onClick={() => setInitAttempt((v) => v + 1)}>
                    重试连接
                  </Button>
                }
              />
            )}

            {loginError && (
              <Alert
                type="error"
                showIcon
                closable
                onClose={() => setLoginError('')}
                className="login-alert"
                description={loginError}
              />
            )}

            {!fetched ? (
              <div className="login-loading-wrap">
                <Spin tip="正在安全加载登录服务…" />
              </div>
            ) : (
              <FormProvider {...methods}>
                <Form
                  layout="vertical"
                  className="login-form"
                  onFinish={methods.handleSubmit(onSubmit)}
                >
                  <FormField
                    name="username"
                    label={<span className="login-label">用户名 / 账号</span>}
                    rules={{
                      validate: rhfZodValidate(LoginFormSchema.shape.username),
                    }}
                  >
                    <Input
                      prefix={<UserOutlined className="login-field-icon" />}
                      autoComplete="username"
                      size="large"
                      placeholder="请输入用户名或绑定邮箱"
                      autoCapitalize="none"
                      spellCheck={false}
                      allowClear
                      autoFocus={!savedUsername && !window.matchMedia('(pointer: coarse)').matches}
                      className="login-input"
                    />
                  </FormField>

                  <FormField
                    name="password"
                    label={
                      <div className="login-password-label-row">
                        <span className="login-label">登录密码</span>
                        {capsLockActive && (
                          <Tooltip title="当前大写锁定已开启，注意密码大小写">
                            <Tag color="warning" className="capslock-warning-tag">
                              <WarningFilled style={{ marginRight: 4 }} />
                              大写锁定已开启
                            </Tag>
                          </Tooltip>
                        )}
                      </div>
                    }
                    rules={{
                      validate: rhfZodValidate(LoginFormSchema.shape.password),
                    }}
                  >
                    <Input.Password
                      prefix={<LockOutlined className="login-field-icon" />}
                      autoComplete="current-password"
                      size="large"
                      placeholder="请输入登录密码"
                      onKeyDown={handlePasswordKeyEvent}
                      onKeyUp={handlePasswordKeyEvent}
                      autoFocus={!!savedUsername && !window.matchMedia('(pointer: coarse)').matches}
                      className="login-input"
                    />
                  </FormField>

                  {twoFactorEnable && (
                    <FormField
                      name="twoFactorCode"
                      label={
                        <div className="login-password-label-row">
                          <span className="login-label">双重验证码 (2FA)</span>
                          <span className="login-label-hint">6 位动态安全码</span>
                        </div>
                      }
                      rules={{
                        validate: (value) => !value || rhfZodValidate(TwoFactorCodeSchema)(value),
                      }}
                    >
                      <Input
                        prefix={<KeyOutlined className="login-field-icon" />}
                        autoComplete="one-time-code"
                        size="large"
                        maxLength={6}
                        placeholder="000000"
                        className="login-input login-2fa-input"
                        allowClear
                      />
                    </FormField>
                  )}

                  <div className="login-helpers-row">
                    <Checkbox
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="login-remember-checkbox"
                    >
                      记住账号
                    </Checkbox>
                    <button
                      type="button"
                      className="login-link-btn"
                      onClick={() => setHelpOpen(true)}
                    >
                      忘记密码？
                    </button>
                  </div>

                  <div className="login-agreement-row">
                    <Checkbox
                      checked={agreedTerms}
                      onChange={(e) => {
                        setAgreedTerms(e.target.checked);
                        if (e.target.checked) localStorage.setItem(AGREED_TERMS_KEY, 'true');
                      }}
                      className="login-agreement-checkbox"
                    >
                      <span className="login-agreement-label">
                        已确认非中国大陆用户，阅读并同意
                        <button
                          type="button"
                          className="login-agreement-link"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openAgreement('terms');
                          }}
                        >
                          《用户协议》
                        </button>
                        与
                        <button
                          type="button"
                          className="login-agreement-link"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openAgreement('compliance');
                          }}
                        >
                          《合规及免责声明》
                        </button>
                      </span>
                    </Checkbox>
                  </div>

                  <Form.Item className="submit-row" style={{ marginTop: 20, marginBottom: 8 }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={submitting}
                      disabled={submitting || !!initError || loginSuccess}
                      size="large"
                      block
                      className={`login-submit-btn ${loginSuccess ? 'is-success' : ''}`}
                    >
                      {loginSuccess ? (
                        <span>
                          <CheckCircleFilled style={{ marginRight: 6 }} /> 登录成功，正在进入…
                        </span>
                      ) : submitting ? (
                        '正在验证身份…'
                      ) : (
                        '立即登录'
                      )}
                    </Button>
                    <div className="login-keyboard-hint">
                      <span>Enter ↵ 快速提交登录</span>
                    </div>
                  </Form.Item>
                </Form>
              </FormProvider>
            )}

            <div className="login-card-footer">
              <span className="login-footer-security">
                <SafetyCertificateOutlined /> 传输全程高强度 TLS 加密防护
              </span>
              <button
                type="button"
                className="login-direct-sub-hint"
                onClick={() => setHelpOpen(true)}
              >
                持有订阅链接？查看订阅中心导入指引 →
              </button>
            </div>
          </div>

          <footer className="login-footer">
            <div className="login-footer-links">
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => openAgreement('terms')}
              >
                用户服务协议
              </button>
              <span className="footer-link-dot">·</span>
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => openAgreement('privacy')}
              >
                隐私保护政策
              </button>
              <span className="footer-link-dot">·</span>
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => openAgreement('compliance')}
              >
                合规使用准则
              </button>
              <span className="footer-link-dot">·</span>
              <button type="button" className="footer-link-btn" onClick={() => setHelpOpen(true)}>
                帮助中心
              </button>
            </div>
            <span className="login-footer-copy">
              © {new Date().getFullYear()} Boan Network. All rights reserved.
            </span>
          </footer>
        </section>

        <section
          className="login-visual"
          style={{ backgroundImage: `url(${earthImage})` }}
          aria-label="全球网络服务背景"
        >
          <div className="login-visual-overlay">
            <div className="login-showcase-card">
              <div className="showcase-badge">
                <GlobalOutlined />
                <span>海外网络基础设施 · 标准国际路由</span>
              </div>
              <h2>全球海外节点，标准互联</h2>
              <p>
                面向海外业务与全球云端服务部署。标准海外国际通用路由（明确不设大陆直连与优化线路），透明流量与极简配置，保障国际公网连通性。
              </p>

              <div className="showcase-feature-grid">
                <div className="showcase-feature-item">
                  <div className="showcase-icon-box">
                    <ThunderboltFilled />
                  </div>
                  <div>
                    <strong>标准国际 Transit</strong>
                    <small>海外通用 BGP 接入 · 不提供大陆方向路由优化</small>
                  </div>
                </div>
                <div className="showcase-feature-item">
                  <div className="showcase-icon-box">
                    <LaptopOutlined />
                  </div>
                  <div>
                    <strong>多平台客户端支持</strong>
                    <small>iOS / Android / Windows / macOS 一键导入</small>
                  </div>
                </div>
                <div className="showcase-feature-item">
                  <div className="showcase-icon-box">
                    <CloudServerOutlined />
                  </div>
                  <div>
                    <strong>透明流量与设备管理</strong>
                    <small>实时统计、在线状态清晰可查</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Modal
        open={helpOpen}
        onCancel={() => setHelpOpen(false)}
        footer={
          <Button type="primary" onClick={() => setHelpOpen(false)}>
            我知道了
          </Button>
        }
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <QuestionCircleOutlined style={{ color: '#3b82f6' }} />
            <span>账户登录与常见问题帮助</span>
          </div>
        }
        width={480}
        centered
      >
        <div className="login-help-dialog">
          <div className="help-section-item">
            <h4>1. 订阅用户如何登录？</h4>
            <p>
              请使用管理员为您开通服务时分配的专属用户名（或绑定的邮箱地址）及密码登录。登录成功后将直接进入「我的订阅」专属用户中心。
            </p>
          </div>
          <div className="help-section-item">
            <h4>2. 忘记用户名或密码？</h4>
            <p>
              系统采用高强度哈希加密保护用户密码。若遗忘密码，请联系您的节点管理员，管理员可在控制台为您一键重置密码。
            </p>
          </div>
          <div className="help-section-item">
            <h4>3. 双重验证码 (2FA) 无法验证？</h4>
            <p>
              如开启了双重验证，请确保您手机的身份验证器应用（如 Google
              Authenticator、1Password）时间与网络时间精准同步。若遗失验证密钥，请联系管理员重置
              2FA。
            </p>
          </div>
          <div className="help-section-item">
            <h4>4. 登录显示「尝试次数过多」？</h4>
            <p>
              为了保护账户免受暴力破解，多次输入错误密码后 IP
              将被临时拦截。请等待数分钟后重试，或更换网络连接。
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={agreementOpen}
        onCancel={() => setAgreementOpen(false)}
        footer={
          <div className="agreement-modal-footer">
            <div className="agreement-footer-security">
              <SafetyCertificateOutlined />
              <span>TLS 1.3 端到端安全传输 · 零活动日志保障</span>
            </div>
            <div className="agreement-footer-btns">
              <Button onClick={() => setAgreementOpen(false)}>返回</Button>
              <Button
                type="primary"
                onClick={() => {
                  setAgreedTerms(true);
                  localStorage.setItem(AGREED_TERMS_KEY, 'true');
                  setAgreementOpen(false);
                  messageApi.success('已同意《用户服务协议》与《隐私保护政策》');
                }}
              >
                我已阅读并同意
              </Button>
            </div>
          </div>
        }
        title={
          <div className="agreement-dialog-title">
            <FileProtectOutlined style={{ color: '#3b82f6', fontSize: 18 }} />
            <span>Boan Network 服务条款与隐私政策说明</span>
          </div>
        }
        width={640}
        centered
        className="login-agreement-modal"
      >
        <div className="login-agreement-body">
          <Tabs
            activeKey={agreementTab}
            onChange={(key) => setAgreementTab(key as 'terms' | 'privacy' | 'compliance')}
            items={[
              {
                key: 'terms',
                label: '用户服务协议',
                children: (
                  <div className="agreement-tab-content">
                    <div className="agreement-clause highlight">
                      <Tag color="red" className="agreement-tag">
                        重要限制
                      </Tag>
                      <h4>1. 适用对象与服务地域限制</h4>
                      <p>
                        本平台服务严格限定仅面向海外合法注册实体及海外居民用户提供。我们郑重声明：
                        <strong>
                          本平台不支持中国大陆用户及中国境内用户，不向任何位于中国大陆境内的个人或机构提供网络代理、加速或相关服务
                        </strong>
                        。若您位于中国大陆境内，请勿注册、购买或尝试使用本服务。
                      </p>
                    </div>
                    <div className="agreement-clause highlight">
                      <Tag color="orange" className="agreement-tag">
                        免责声明
                      </Tag>
                      <h4>2. 国际通用网络 · 不保证大陆优化声明</h4>
                      <p>
                        所有服务器与节点均依托海外标准国际骨干网（Global Internet Transit /
                        BGP）进行路由传输。
                        <strong>
                          运营方明确不保证、不承诺任何针对中国大陆方向的网络路由优化、直连加速（包括但不限于
                          CN2、AS9929、CMI 等特种直连线路）或延迟保障
                        </strong>
                        。因跨境公网拥堵、国际光缆异常或大陆运营商网络策略调整引发的高延迟、丢包或无法连接，均属于公网不可控常态，运营方不承担质量担保责任，亦不构成退款支持理由。
                      </p>
                    </div>
                    <div className="agreement-clause">
                      <h4>3. 账户权责与安全规范</h4>
                      <p>
                        本账户仅供授权用户本人合法合规使用，严禁转借、倒卖、公开发布或多公网 IP
                        非法扩散。用户有责任妥善保管登录密码与双因素认证 (2FA)
                        密钥。因个人原因泄露凭证造成的流量与财产损失由用户自行承担。
                      </p>
                    </div>
                    <div className="agreement-clause">
                      <h4>4. 合理使用准则（AUP）</h4>
                      <p>
                        用户承诺恪守当地及服务器所在区域法律法规。严禁利用本网络从事任何网络攻击（如
                        DDoS、端口扫描、漏洞利用）、垃圾邮件群发、网络欺诈或侵犯第三方合法知识产权之行为。违规者将被立即熔断并注销服务账户。
                      </p>
                    </div>
                    <div className="agreement-clause">
                      <h4>5. 网络资源公平使用（Fair Use Policy）</h4>
                      <p>
                        为确保集群节点全体用户的连接质量与超低延迟体验，系统实施智能队列与公平调度机制。对于单客户端异常持续占满峰值带宽或发起海量高频突发并发连接的情形，系统将自适应限制速率以维护整体链路稳定。
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'privacy',
                label: '隐私保护政策',
                children: (
                  <div className="agreement-tab-content">
                    <div className="agreement-clause highlight">
                      <Tag color="blue" className="agreement-tag">
                        核心承诺
                      </Tag>
                      <h4>1. 严格的零活动日志政策（Zero Traffic Logs）</h4>
                      <p>
                        我们坚决捍卫用户隐私。节点与系统不记录、不解析、不跟踪、亦绝不出售任何用户的网页浏览历史、访问目标域名、请求数据载荷或
                        DNS 查询明细。
                      </p>
                    </div>
                    <div className="agreement-clause">
                      <h4>2. 最小化数据采集范围</h4>
                      <p>
                        我们仅在服务运行所必需的最小限度内收集计量数据：周期内已用上传/下载总字节数（用于套餐流量核算）、最后握手时间戳及设备硬件标识哈希（用于限制设备超额登录与防盗刷）。
                      </p>
                    </div>
                    <div className="agreement-clause">
                      <h4>3. 密码与认证安全</h4>
                      <p>
                        所有用户密码均采用不可逆安全哈希加盐存储；全平台交互强制采用现代 TLS 1.3
                        传输加密；双因素认证遵循标准 TOTP 算法，全方位杜绝中间人劫持与撞库风险。
                      </p>
                    </div>
                    <div className="agreement-clause">
                      <h4>4. 数据的留存与注销</h4>
                      <p>
                        当您的订阅服务过期终止或申请注销账户后，系统将自动抹除设备绑定与临时会话令牌数据，不留存多余历史痕迹。
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'compliance',
                label: '合规与免责声明',
                children: (
                  <div className="agreement-tab-content">
                    <div className="agreement-clause highlight">
                      <Tag color="red" className="agreement-tag">
                        合规准则
                      </Tag>
                      <h4>1. 地域合规与防范声明</h4>
                      <p>
                        我们严格遵守相关法律法规，明确不支持中国大陆及中国境内用户，绝不为中国大陆境内用户提供规避网络监管、穿透访问等任何违规服务。用户须在完全符合其自身所在地法律法规及合规要求的前提下使用。
                      </p>
                    </div>
                    <div className="agreement-clause highlight">
                      <Tag color="orange" className="agreement-tag">
                        免责说明
                      </Tag>
                      <h4>2. 大陆网络连通性免责声明</h4>
                      <p>
                        本服务面向全球公网互联，针对任何指向中国大陆方向发生的特定 IP
                        阻断、端口重置或不可达，平台不提供针对大陆方向的连通性可用性保证或人工换 IP
                        保障。
                      </p>
                    </div>
                    <div className="agreement-clause">
                      <h4>3. 违规行为处理机制</h4>
                      <p>
                        系统安全网关若监测到异常高频恶意流量或违反服务地域限制的行为，将自动触发熔断防御机制，注销违规账户且不予退费。
                      </p>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Modal>
    </ConfigProvider>
  );
}
