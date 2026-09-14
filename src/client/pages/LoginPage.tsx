import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Bike, CheckCircle2, Eye, EyeOff, LockKeyhole, Route, ShieldCheck, Store as Shop, UserRound } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui";
import { apiMessage } from "../lib/format";
import type { Role } from "../lib/types";

const DEMO_PASSWORD = "DemoOnly123!";
const showLocalAccounts = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== "false";
const demos: Array<{ role: Role; title: string; username: string; icon: typeof Shop; note: string }> = [
  { role: "admin", title: "管理员", username: "demo_admin", icon: ShieldCheck, note: "调度与全局运营" },
  { role: "merchant", title: "商户", username: "demo_merchant", icon: Shop, note: "发单与账户查看" },
  { role: "rider", title: "骑手", username: "demo_rider", icon: Bike, note: "接单与履约操作" }
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(showLocalAccounts ? "demo_admin" : "");
  const [password, setPassword] = useState(showLocalAccounts ? DEMO_PASSWORD : "");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigate("/", { replace: true });
    } catch (reason) {
      setError(apiMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-story">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />
        <div className="login-story-inner">
          <div className="login-brand"><span className="brand-mark"><Route size={22} /></span><strong>RunnerGo 配送</strong></div>
          <div className="story-copy">
            <span className="story-pill"><span /> 本地开发演示系统</span>
            <h1>让每一次配送，<br /><em>更清晰地抵达。</em></h1>
            <p>从商户发单、运营调度到骑手履约，在一个轻量工作台里完成配送闭环。</p>
            <div className="story-points">
              <span><CheckCircle2 /> 角色权限隔离</span>
              <span><CheckCircle2 /> 订单全程留痕</span>
              <span><CheckCircle2 /> 费用自动核算</span>
            </div>
          </div>
          <div className="route-preview" aria-hidden="true">
            <div className="route-line"><span className="route-dot dot-a" /><span className="route-dot dot-b" /><span className="route-bike"><Bike size={20} /></span></div>
            <div className="route-place place-a"><small>取货点</small><strong>演示烘焙店</strong></div>
            <div className="route-place place-b"><small>预计送达</small><strong>18 分钟</strong></div>
          </div>
          <small className="story-foot">RunnerGo · Original local MVP</small>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-mobile-brand"><span className="brand-mark"><Route size={20} /></span><strong>RunnerGo</strong></div>
          <header>
            <span className="eyebrow">欢迎回来</span>
            <h2>登录工作台</h2>
            <p>{showLocalAccounts ? "选择演示角色，或输入本地账号继续。" : "输入演示账号，查看订单与配送任务。"}</p>
          </header>

          {showLocalAccounts ? <div className="demo-accounts">
            {demos.map((demo) => {
              const Icon = demo.icon;
              const active = username === demo.username;
              return (
                <button
                  type="button"
                  className={active ? "demo-account active" : "demo-account"}
                  key={demo.username}
                  onClick={() => { setUsername(demo.username); setPassword(DEMO_PASSWORD); setError(""); }}
                >
                  <span className={`demo-icon demo-${demo.role}`}><Icon size={19} /></span>
                  <span><strong>{demo.title}</strong><small>{demo.note}</small></span>
                  {active ? <CheckCircle2 className="demo-check" size={17} /> : null}
                </button>
              );
            })}
          </div> : null}

          <div className="login-divider"><span>账号登录</span></div>
          <form onSubmit={handleSubmit} className="login-form">
            <label>
              <span>账号</span>
              <div className="input-with-icon"><UserRound size={18} /><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" required /></div>
            </label>
            <label>
              <span>密码</span>
              <div className="input-with-icon"><LockKeyhole size={18} /><input autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </label>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            <Button size="lg" type="submit" loading={loading}>进入工作台 <ArrowRight size={18} /></Button>
          </form>
          <p className="login-hint">{showLocalAccounts ? "以上均为本地演示账号。" : "快递代取演示环境 · 不收取费用，不产生真实配送收入。"}</p>
        </div>
      </section>
    </div>
  );
}
