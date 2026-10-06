import { ArrowRightOutlined } from '@ant-design/icons';
import serverImage from '@/assets/portal/server-rack.png';
import './LoginPage.css';

export default function LandingPage() {
  const login = `${window.X_UI_BASE_PATH || '/'}login`;
  return (
    <main className="portal-landing">
      <header className="landing-nav">

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
          <span className="landing-hint">已有账户？登录即可查看您的服务</span>
        </div>
      </section>
      <footer className="landing-footer">
        <a href={login}>
          登录账户 <ArrowRightOutlined />
        </a>
      </footer>
    </main>
  );
}
