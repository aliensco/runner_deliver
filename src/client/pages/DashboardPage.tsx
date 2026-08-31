import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bike,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  PackageOpen,
  Route,
  Store as Shop,
  Sparkles,
  TrendingUp,
  UsersRound,
  WalletCards
} from "lucide-react";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { apiMessage, datetime, money, riderStatusLabel, statusLabel } from "../lib/format";
import type { Order, OrderStatus, User } from "../lib/types";

interface DashboardPayload {
  role: "admin" | "merchant" | "rider";
  orderCounts: Record<OrderStatus, number>;
  merchants?: { activeCount: number; totalBalanceCents: number };
  riders?: { activeCount: number; totalBalanceCents: number };
  financials?: {
    orderChargesCents?: number;
    deliveredOrderValueCents?: number;
    riderPayoutsCents?: number;
    chargesCents?: number;
    refundsCents?: number;
  };
  balanceCents?: number;
  payoutTotalCents?: number;
  riderStatus?: string;
}

const chartStatuses: OrderStatus[] = ["pending", "assigned", "accepted", "picked_up", "delivered"];

function FulfillmentChart({ counts }: { counts: Record<OrderStatus, number> }) {
  const values = chartStatuses.map((status) => counts[status] ?? 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${22 + index * 65},${108 - (value / max) * 78}`).join(" ");
  const area = `22,116 ${points} 282,116`;
  return (
    <div className="chart-wrap">
      <svg className="trend-chart" viewBox="0 0 304 132" role="img" aria-label="当前订单履约阶段走势">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#605bff" stopOpacity=".28" />
            <stop offset="1" stopColor="#605bff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="chart-grid" d="M18 30H286M18 72H286M18 116H286" />
        <polygon points={area} fill="url(#trend-fill)" />
        <polyline points={points} fill="none" stroke="#605bff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((value, index) => <circle key={index} cx={22 + index * 65} cy={108 - (value / max) * 78} r="4" fill="#fff" stroke="#605bff" strokeWidth="3" />)}
      </svg>
      <div className="chart-labels">{chartStatuses.map((status) => <span key={status}>{statusLabel[status]}<strong>{counts[status] ?? 0}</strong></span>)}</div>
    </div>
  );
}

function RecentOrders({ orders }: { orders: Order[] }) {
  if (!orders.length) return <EmptyState title="还没有订单" description="创建第一笔配送订单后，进度会显示在这里" />;
  return (
    <div className="compact-order-list">
      {orders.slice(0, 5).map((order) => (
        <Link to={`/orders/${order.id}`} className="compact-order" key={order.id}>
          <span className="order-symbol"><PackageOpen size={18} /></span>
          <span className="compact-order-main"><strong>{order.orderNo}</strong><small>{order.deliveryAddress}</small></span>
          <span className="compact-order-meta"><StatusBadge status={order.status} /><small>{datetime(order.createdAt)}</small></span>
          <ArrowRight size={17} />
        </Link>
      ))}
    </div>
  );
}

export function DashboardPage({ user }: { user: User }) {
  const result = useAsync(async () => {
    const [dashboard, orders] = await Promise.all([api.dashboard.get(), api.orders.list({ limit: 8 })]);
    return { dashboard: dashboard as DashboardPayload, orders: orders.orders };
  }, [user.role]);

  if (result.loading) return <><PageHeader title="工作台" description="正在同步最新运营数据" /><LoadingState /></>;
  if (result.error || !result.data) return <><PageHeader title="工作台" /><ErrorState message={apiMessage(result.error)} retry={result.reload} /></>;

  const { dashboard, orders } = result.data;
  if (user.role === "merchant") return <MerchantDashboard dashboard={dashboard} orders={orders} user={user} />;
  if (user.role === "rider") return <RiderDashboard dashboard={dashboard} orders={orders} user={user} />;
  return <AdminDashboard dashboard={dashboard} orders={orders} user={user} />;
}

function AdminDashboard({ dashboard, orders, user }: { dashboard: DashboardPayload; orders: Order[]; user: User }) {
  const activeOrders = ["pending", "assigned", "accepted", "picked_up"].reduce((total, status) => total + (dashboard.orderCounts[status as OrderStatus] ?? 0), 0);
  const completionBase = dashboard.orderCounts.delivered + activeOrders;
  const completion = completionBase ? Math.round((dashboard.orderCounts.delivered / completionBase) * 100) : 0;
  return (
    <>
      <PageHeader eyebrow="运营总览" title={`${timeGreeting()}，${user.displayName}`} description="这是当前配送网络的实时快照。" actions={<Link className="button button-primary button-md" to="/dispatch"><Route size={18} />进入调度台</Link>} />
      <div className="metric-grid metric-grid-four">
        <MetricCard label="进行中订单" value={String(activeOrders)} note={`${dashboard.orderCounts.pending} 笔待派`} icon={PackageOpen} tone="violet" />
        <MetricCard label="已完成配送" value={String(dashboard.orderCounts.delivered)} note={`履约完成率 ${completion}%`} icon={PackageCheck} tone="green" />
        <MetricCard label="活跃骑手" value={String(dashboard.riders?.activeCount ?? 0)} note={`${dashboard.orderCounts.picked_up} 人配送中`} icon={Bike} tone="blue" />
        <MetricCard label="累计订单额" value={money(dashboard.financials?.orderChargesCents)} note={`骑手收入 ${money(dashboard.financials?.riderPayoutsCents)}`} icon={CircleDollarSign} tone="orange" />
      </div>
      <div className="dashboard-grid">
        <Panel title="履约阶段走势" subtitle="按当前订单所处阶段生成的运营快照" action={<span className="live-chip"><i />实时</span>} className="chart-panel"><FulfillmentChart counts={dashboard.orderCounts} /></Panel>
        <Panel title="网络概况" subtitle="配送供给与合作商户" className="network-panel">
          <div className="network-stat"><span className="metric-icon tone-blue"><UsersRound /></span><span><small>活跃骑手</small><strong>{dashboard.riders?.activeCount ?? 0}</strong></span><em>人</em></div>
          <div className="network-stat"><span className="metric-icon tone-orange"><Shop /></span><span><small>活跃商户</small><strong>{dashboard.merchants?.activeCount ?? 0}</strong></span><em>家</em></div>
          <div className="balance-strip"><Sparkles size={18} /><span><small>商户可用余额合计</small><strong>{money(dashboard.merchants?.totalBalanceCents)}</strong></span></div>
        </Panel>
      </div>
      <Panel title="最近订单" subtitle="最新创建的配送任务" action={<Link to="/orders" className="text-link">查看全部 <ArrowRight size={15} /></Link>}><RecentOrders orders={orders} /></Panel>
    </>
  );
}

function MerchantDashboard({ dashboard, orders, user }: { dashboard: DashboardPayload; orders: Order[]; user: User }) {
  const active = dashboard.orderCounts.pending + dashboard.orderCounts.assigned + dashboard.orderCounts.accepted + dashboard.orderCounts.picked_up;
  return (
    <>
      <PageHeader eyebrow="商户工作台" title={`${timeGreeting()}，${user.displayName}`} description="快速发单，并随时掌握配送进度与账户支出。" actions={<Link to="/orders/new" className="button button-primary button-md"><PackageOpen size={18} />创建配送单</Link>} />
      <section className="merchant-hero">
        <div><span>账户可用余额</span><strong>{money(dashboard.balanceCents)}</strong><small>创建订单后将按计价规则自动扣费</small></div>
        <WalletCards size={74} />
        <Link to="/ledger">查看资金明细 <ArrowRight size={16} /></Link>
      </section>
      <div className="metric-grid metric-grid-three">
        <MetricCard label="进行中" value={String(active)} note={`${dashboard.orderCounts.picked_up} 笔正在配送`} icon={Clock3} tone="violet" />
        <MetricCard label="已送达" value={String(dashboard.orderCounts.delivered)} note="累计完成订单" icon={PackageCheck} tone="green" />
        <MetricCard label="累计配送支出" value={money(dashboard.financials?.chargesCents)} note={`已退款 ${money(dashboard.financials?.refundsCents)}`} icon={TrendingUp} tone="orange" />
      </div>
      <Panel title="最近配送" subtitle="你的最新订单进展" action={<Link to="/orders" className="text-link">全部订单 <ArrowRight size={15} /></Link>}><RecentOrders orders={orders} /></Panel>
    </>
  );
}

function RiderDashboard({ dashboard, orders, user }: { dashboard: DashboardPayload; orders: Order[]; user: User }) {
  const active = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const next = active[0];
  return (
    <div className="rider-page">
      <PageHeader eyebrow="骑手工作台" title={`${timeGreeting()}，${user.displayName}`} description="注意安全，新的配送任务已为你整理好。" />
      <section className="rider-status-hero">
        <div className="rider-status-top"><span className={`availability-dot ${dashboard.riderStatus}`} /><span><small>当前工作状态</small><strong>{riderStatusLabel[dashboard.riderStatus ?? "offline"]}</strong></span><Link to="/profile">调整状态</Link></div>
        <div className="rider-earnings"><span><small>账户收入</small><strong>{money(dashboard.balanceCents)}</strong></span><span><small>累计配送收入</small><strong>{money(dashboard.payoutTotalCents)}</strong></span></div>
      </section>
      {next ? (
        <Panel title="下一项任务" subtitle="按履约顺序完成当前配送" className="next-task-panel">
          <Link to={`/orders/${next.id}`} className="next-task-card">
            <div className="next-task-head"><StatusBadge status={next.status} /><span>{next.orderNo}</span><ArrowRight /></div>
            <div className="delivery-route"><span className="route-pins"><i /><b /><i /></span><span><small>取货</small><strong>{next.pickupAddress}</strong><small>送达</small><strong>{next.deliveryAddress}</strong></span></div>
            <div className="next-task-foot"><span><Route size={16} /> {(next.distanceMeters / 1000).toFixed(1)} km</span><span>本单预计收入 <strong>{money(next.riderPayoutCents)}</strong></span></div>
          </Link>
        </Panel>
      ) : <EmptyState title="当前没有配送任务" description="保持在线，等待运营为你派单" action={<Link to="/tasks" className="button button-secondary button-md">查看历史任务</Link>} />}
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Bike; tone: string }) {
  return <article className="metric-card"><div className="metric-card-top"><span className={`metric-icon tone-${tone}`}><Icon /></span><span className="metric-arrow"><TrendingUp size={15} /></span></div><small>{label}</small><strong>{value}</strong><p>{note}</p></article>;
}

function timeGreeting() {
  const hour = new Date().getHours();
  return hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
}
