import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bike,
  ClipboardList,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  ReceiptText,
  Route,
  Settings,
  Store as Shop,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  WalletCards,
  X
} from "lucide-react";
import { initials, roleLabel } from "../lib/format";
import type { Role, User } from "../lib/types";

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }

const roleNav: Record<Role, NavItem[]> = {
  admin: [
    { to: "/", label: "运营首页", icon: LayoutDashboard, end: true },
    { to: "/dispatch", label: "智能调度", icon: Route },
    { to: "/orders", label: "订单管理", icon: ClipboardList },
    { to: "/merchants", label: "商户管理", icon: Shop },
    { to: "/riders", label: "骑手管理", icon: UsersRound },
    { to: "/pricing", label: "计价规则", icon: SlidersHorizontal },
    { to: "/ledger", label: "资金流水", icon: ReceiptText },
    { to: "/settings", label: "系统设置", icon: Settings }
  ],
  merchant: [
    { to: "/", label: "商户首页", icon: LayoutDashboard, end: true },
    { to: "/orders/new", label: "发起配送", icon: Command },
    { to: "/orders", label: "我的订单", icon: ClipboardList },
    { to: "/ledger", label: "账户资金", icon: WalletCards }
  ],
  rider: [
    { to: "/", label: "任务大厅", icon: Bike, end: true },
    { to: "/tasks", label: "我的任务", icon: ClipboardList },
    { to: "/income", label: "收入明细", icon: WalletCards },
    { to: "/profile", label: "工作状态", icon: UserRound }
  ]
};

export function AppShell({
  user,
  onLogout,
  children
}: {
  user: User;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  async function logout() {
    setLoggingOut(true);
    try {
      await onLogout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobileOpen ? <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <NavLink to="/" className="brand" aria-label="RunnerGo 首页">
            <span className="brand-mark"><Route size={21} /></span>
            <span className="brand-copy"><strong>RunnerGo</strong><small>同城配送</small></span>
          </NavLink>
          <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X /></button>
        </div>

        <div className="workspace-chip">
          <span className="workspace-icon"><Shop size={17} /></span>
          <span><small>当前工作台</small><strong>{roleLabel[user.role]}</strong></span>
        </div>

        <nav className="main-nav">
          <span className="nav-caption">工作区</span>
          {roleNav[user.role].map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} title={collapsed ? item.label : undefined}>
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-block">
            <span className="avatar">{initials(user.displayName)}</span>
            <span className="user-copy"><strong>{user.displayName}</strong><small>{roleLabel[user.role]}</small></span>
            <button className="icon-button icon-button-inverse" disabled={loggingOut} onClick={logout} aria-label="退出登录"><LogOut size={18} /></button>
          </div>
          <button className="collapse-button" onClick={() => setCollapsed((value) => !value)}>
            <PanelLeftClose size={17} />
            <span>{collapsed ? "展开导航" : "收起导航"}</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu /></button>
          <span className="mobile-logo"><Route size={18} /> RunnerGo</span>
          <span className="avatar avatar-small">{initials(user.displayName)}</span>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
