import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bike, CheckCircle2, Clock3, MapPin, Navigation, Power, Route, ShieldCheck, Smartphone, UserRound, WalletCards } from "lucide-react";
import { useToast } from "../components/toast";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { apiMessage, datetime, distance, money, riderStatusLabel, statusLabel, vehicleLabel } from "../lib/format";
import type { Order, RiderStatus, User } from "../lib/types";

type TaskTab = "active" | "done" | "all";

export function RiderTasksPage() {
  const [tab, setTab] = useState<TaskTab>("active");
  const result = useAsync(() => api.orders.list({ limit: 100 }), []);
  const tasks = useMemo(() => (result.data?.orders ?? []).filter((order) => tab === "active" ? !["delivered", "cancelled"].includes(order.status) : tab === "done" ? ["delivered", "cancelled"].includes(order.status) : true), [result.data, tab]);
  return <div className="rider-page"><PageHeader eyebrow="配送任务" title="我的任务" description="按履约顺序处理被指派给你的订单。" /><div className="segment-tabs"><button className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>进行中 <span>{result.data?.orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length ?? 0}</span></button><button className={tab === "done" ? "active" : ""} onClick={() => setTab("done")}>已完成</button><button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>全部</button></div>{result.loading ? <LoadingState /> : result.error ? <ErrorState message={apiMessage(result.error)} retry={result.reload} /> : !tasks.length ? <EmptyState title={tab === "active" ? "没有进行中的任务" : "暂无任务记录"} description={tab === "active" ? "保持在线，等待运营为你指派新订单" : "完成配送后，历史记录会显示在这里"} /> : <div className="task-card-list">{tasks.map((order) => <TaskCard order={order} key={order.id} />)}</div>}</div>;
}

function TaskCard({ order }: { order: Order }) {
  const action = order.status === "assigned" ? "去接单" : order.status === "accepted" ? "去取货" : order.status === "picked_up" ? "确认送达" : "查看详情";
  return <Link to={`/orders/${order.id}`} className={`task-card task-${order.status}`}><header><span>{order.orderNo}<small>{datetime(order.createdAt)}</small></span><StatusBadge status={order.status} /></header><div className="task-route"><div><i /><span /><b /></div><section><p><small>取货</small><strong>{order.pickupAddress}</strong></p><p><small>送达</small><strong>{order.deliveryAddress}</strong></p></section></div><div className="task-contact"><span><UserRound size={15} />{order.recipientName}</span><span>{order.recipientPhone}</span><span><Route size={15} />{distance(order.distanceMeters)}</span></div><footer><span><small>预计收入</small><strong>{money(order.riderPayoutCents)}</strong></span><span className="task-action">{action}<ArrowRight size={17} /></span></footer></Link>;
}

export function RiderProfilePage({ user }: { user: User }) {
  const toast = useToast();
  const [target, setTarget] = useState<RiderStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const result = useAsync(() => api.riders.get(user.riderId!), [user.riderId]);
  async function update() { if (!target || !result.data) return; setSaving(true); try { await api.riders.update(result.data.rider.id, { status: target }); toast(`工作状态已更新为“${riderStatusLabel[target]}”`); setTarget(null); result.reload(); } catch (reason) { toast(apiMessage(reason), "error"); } finally { setSaving(false); } }
  if (result.loading) return <div className="rider-page"><PageHeader title="工作状态" /><LoadingState /></div>;
  if (result.error || !result.data) return <div className="rider-page"><PageHeader title="工作状态" /><ErrorState message={apiMessage(result.error)} retry={result.reload} /></div>;
  const rider = result.data.rider;
  return <div className="rider-page"><PageHeader eyebrow="骑手中心" title="工作状态" description="管理接单状态与查看本地账号资料。" /><section className="profile-hero"><div className="profile-avatar">{rider.name.slice(0, 2)}<i className={rider.status} /></div><div><h2>{rider.name}</h2><p>{rider.phone}</p><Badge dot tone={rider.status}>{riderStatusLabel[rider.status]}</Badge></div><Bike /></section><Panel title="接单状态" subtitle="有进行中任务时，服务端可能拒绝收工或切回可接单"><div className="availability-actions"><button className={rider.status === "available" ? "active" : ""} disabled={rider.status === "available"} onClick={() => setTarget("available")}><span><Navigation /></span><strong>开始接单</strong><small>允许运营为你指派配送任务</small><CheckCircle2 /></button><button className={rider.status === "offline" ? "active offline" : "offline"} disabled={rider.status === "offline"} onClick={() => setTarget("offline")}><span><Power /></span><strong>结束接单</strong><small>收工后将不再进入可派运力</small><CheckCircle2 /></button></div></Panel><Panel title="个人资料" subtitle="当前版本暂不支持骑手自行修改资料"><dl className="profile-list"><div><dt><Smartphone />联系电话</dt><dd>{rider.phone}</dd></div><div><dt><Bike />交通工具</dt><dd>{vehicleLabel[rider.vehicleType] ?? rider.vehicleType}</dd></div><div><dt><WalletCards />收入余额</dt><dd>{money(rider.balanceCents)}</dd></div><div><dt><ShieldCheck />账号状态</dt><dd>{rider.active ? "已启用" : "已停用"}</dd></div></dl><p className="readonly-note">资料修改与提现接口暂未提供，请联系运营管理员处理。</p></Panel><ConfirmDialog open={Boolean(target)} title={target === "offline" ? "确认结束接单？" : "确认开始接单？"} description={target === "offline" ? "若仍有进行中的配送任务，服务端将拒绝收工并保留当前状态。" : "上线后运营可为你指派新的配送任务。"} confirmLabel={target === "offline" ? "确认收工" : "开始接单"} danger={target === "offline"} loading={saving} onClose={() => setTarget(null)} onConfirm={update} /></div>;
}
