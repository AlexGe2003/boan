import { ArrowRightOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import serverImage from '@/assets/portal/server-rack.png';
import './LoginPage.css';

export default function LandingPage() {
  const login = `${window.X_UI_BASE_PATH || '/'}login`;
  return (
    <main className="portal-landing">
      <header className="landing-nav">
        <div className="portal-brand">
          <div className="brand-logo-icon">
            <SafetyCertificateOutlined />
          </div>
          <div className="brand-text-wrap">
            <strong className="brand-title">Boan</strong>
            <span className="brand-badge">服务门户</span>
          </div>
        </div>
        <a className="portal-button small" href={login}>
          登录账户 <ArrowRightOutlined />
        </a>
      </header>
      <section className="landing-hero" style={{ backgroundImage: `url(${serverImage})` }}>
        <div className="landing-hero-content">
          <span className="portal-eyebrow">
            <i /> 让每一次连接，更从容
          </span>
          <h1>与世界，自由相连。</h1>
          <p>
            一个属于您的网络空间。
            <br />
            轻松查看流量、管理订阅，开启下一段连接。
          </p>
          <a className="portal-button" href={login}>
            进入我的首页 <ArrowRightOutlined />
          </a>
          <span className="landing-hint">
            面向海外合规业务部署 · 不提供大陆优化线路 · 不支持大陆用户
          </span>
        </div>
      </section>
      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Boan Network. All rights reserved.</span>
        <a href={login} className="landing-footer-login">
          登录用户中心 <ArrowRightOutlined />
        </a>
      </footer>
    </main>
  );
}
