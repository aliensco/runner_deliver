import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bike, CircleDollarSign, Clock3, Edit3, MapPin, PackageCheck, Phone, Route, Store as Shop, UserRound, XCircle } from "lucide-react";
import { OrderForm } from "../components/OrderForm";
import { useToast } from "../components/toast";
import { Button, ConfirmDialog, EmptyState, ErrorState, Field, LoadingState, Modal, PageHeader, Panel, StatusBadge } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { apiMessage, distance, fullDatetime, money, statusLabel } from "../lib/format";
import type { Order, OrderEvent, OrderStatus, Rider, User } from "../lib/types";

const eventLabels: Record<string, string> = { created: "订单已创建", assigned: "已指派骑手", reassigned: "已重新指派骑手", details_updated: "订单信息已修改", status_changed: "订单状态已更新" };

export function OrderDetailPage({ user }: { user: User }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus | null>(null);
  const result = useAsync(async () => {
    const [orderResponse, eventResponse] = await Promise.all([api.orders.get(Number(id)), api.orders.events(Number(id))]);
    return { order: orderResponse.order, events: eventResponse.events };
  }, [id]);

  if (result.loading) return <><PageHeader title="订单详情" /><LoadingState /></>;
  if (result.error || !result.data) return <><PageHeader title="订单详情" actions={<Button kind="ghost" onClick={() => navigate(-1)}><ArrowLeft size={17} />返回</Button>} /><ErrorState message={apiMessage(result.error)} retry={result.reload} /></>;
  const { order, events } = result.data;

  async function transition(status: OrderStatus, reason?: string) {
    setActionLoading(true);
    try {
      await api.orders.changeStatus(order.id, { status: status as "accepted" | "picked_up" | "delivered" | "cancelled", ...(reason ? { cancellationReason: reason } : {}) });
      toast(status === "cancelled" ? "订单已取消，相关费用已按规则退回" : `订单已更新为“${statusLabel[status]}”`);
      setNextStatus(null); setCancelOpen(false); setCancelReason(""); result.reload();
    } catch (reasonError) { toast(apiMessage(reasonError), "error"); } finally { setActionLoading(false); }
  }

  const riderNext: Partial<Record<OrderStatus, OrderStatus>> = { assigned: "accepted", accepted: "picked_up", picked_up: "delivered" };
  const availableNext = user.role === "rider" ? riderNext[order.status] : undefined;
  const cancellable = (user.role === "admin" || user.role === "merchant") && ["pending", "assigned", "accepted"].includes(order.status);

  return (
    <>
      <PageHeader eyebrow="订单详情" title={order.orderNo} description={`创建于 ${fullDatetime(order.createdAt)}`} actions={<><Button kind="ghost" onClick={() => navigate(-1)}><ArrowLeft size={17} />返回</Button>{order.status === "pending" && user.role !== "rider" ? <Button kind="secondary" onClick={() => setEditOpen(true)}><Edit3 size={16} />编辑</Button> : null}{user.role === "admin" && ["pending", "assigned", "accepted"].includes(order.status) ? <Button onClick={() => setAssignOpen(true)}><Bike size={17} />{order.riderId ? "重新派单" : "指派骑手"}</Button> : null}</>} />
      <div className="order-detail-grid">
        <div className="order-detail-main">
          <Panel className="order-state-card">
            <div className="detail-status-head"><div><StatusBadge status={order.status} /><h2>{statusHeadline(order.status)}</h2><p>{statusDescription(order.status, order)}</p></div><span className={`status-illustration status-${order.status}`}><PackageCheck /></span></div>
            <Progress status={order.status} />
            {availableNext ? <div className="fulfillment-action"><span><strong>下一步：{statusLabel[availableNext]}</strong><small>确认现场操作已完成后再更新状态</small></span><Button size="lg" onClick={() => setNextStatus(availableNext)}>{actionLabel(availableNext)} <Route size={18} /></Button></div> : null}
          </Panel>
          <Panel title="配送路线" subtitle={distance(order.distanceMeters)}>
            <div className="detail-route"><div className="route-axis"><i /><span /><b /><span /><i /></div><div className="route-addresses"><section><small>取货地址</small><strong>{order.pickupAddress}</strong><span><Shop size={14} />{order.merchantName}</span></section><section><small>送达地址</small><strong>{order.deliveryAddress}</strong><span><UserRound size={14} />{order.recipientName} · {order.recipientPhone}</span></section></div></div>
            {order.itemsDescription ? <div className="order-note"><strong>物品备注</strong><p>{order.itemsDescription}</p></div> : null}
          </Panel>
          <Panel title="订单轨迹" subtitle="每一步操作由服务端留痕">
            {events.length ? <OrderTimeline events={events} /> : <EmptyState title="暂无轨迹" description="订单操作记录尚未生成" />}
          </Panel>
        </div>
        <aside className="order-detail-side">
          {order.parcelDemo ? <Panel title="快递代取 · 演示订单" subtitle="不收费，不产生真实骑手收入"><dl className="detail-list"><div><dt>校区</dt><dd>{order.parcelDemo.campusName}</dd></div><div><dt>包裹数量</dt><dd>{order.parcelDemo.parcelCount} 件</dd></div><div><dt>取件码</dt><dd>{order.parcelDemo.pickupCode || "订单已结束，不再展示"}</dd></div></dl></Panel> : null}
          <Panel title="订单信息">
            <dl className="detail-list"><div><dt>订单状态</dt><dd><StatusBadge status={order.status} /></dd></div><div><dt>配送距离</dt><dd>{distance(order.distanceMeters)}</dd></div><div><dt>配送费用</dt><dd>{money(order.merchantChargeCents)}</dd></div><div><dt>骑手收入</dt><dd>{money(order.riderPayoutCents)}</dd></div><div><dt>计价规则</dt><dd>{order.pricingRuleName}</dd></div></dl>
          </Panel>
          <Panel title="相关人员">
            <div className="contact-card"><span className="avatar avatar-soft">{order.merchantName.slice(0, 2)}</span><span><small>下单商户</small><strong>{order.merchantName}</strong></span></div>
            <div className="contact-card"><span className="avatar avatar-soft"><Bike size={17} /></span><span><small>配送骑手</small><strong>{order.riderName ?? "暂未指派"}</strong></span>{!order.riderName && user.role === "admin" ? <button onClick={() => setAssignOpen(true)}>立即派单</button> : null}</div>
            <a className="contact-card" href={`tel:${order.recipientPhone}`}><span className="avatar avatar-soft"><Phone size={17} /></span><span><small>收货人</small><strong>{order.recipientName}</strong><em>{order.recipientPhone}</em></span></a>
          </Panel>
          {cancellable ? <button className="cancel-order-link" onClick={() => setCancelOpen(true)}><XCircle size={17} />取消此订单</button> : null}
        </aside>
      </div>

      <Modal open={editOpen} title="编辑订单" description="只有待派单订单可以修改，距离和费用不会重新计算。" onClose={() => setEditOpen(false)} wide><OrderForm user={user} initial={order} compact onCancel={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); toast("订单信息已保存"); result.reload(); }} /></Modal>
      <AssignModal open={assignOpen} order={order} onClose={() => setAssignOpen(false)} onAssigned={() => { setAssignOpen(false); toast("骑手指派成功"); result.reload(); }} />
      <Modal open={cancelOpen} title="取消订单" description="取消后商户费用将按服务端规则原路退回，此操作不可撤销。" onClose={() => setCancelOpen(false)}><form onSubmit={(event) => { event.preventDefault(); void transition("cancelled", cancelReason); }}><Field label="取消原因" required full><textarea rows={4} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} minLength={1} maxLength={500} placeholder="请说明取消原因" required /></Field><div className="form-actions"><Button type="button" kind="ghost" onClick={() => setCancelOpen(false)}>返回</Button><Button type="submit" kind="danger" loading={actionLoading}>确认取消</Button></div></form></Modal>
      <ConfirmDialog open={Boolean(nextStatus)} title={`确认${nextStatus ? statusLabel[nextStatus] : "更新"}？`} description="状态更新会立即写入订单轨迹，请确认现场履约动作已经完成。" confirmLabel={nextStatus ? actionLabel(nextStatus) : "确认"} loading={actionLoading} onClose={() => setNextStatus(null)} onConfirm={() => { if (nextStatus) void transition(nextStatus); }} />
    </>
  );
}

function AssignModal({ open, order, onClose, onAssigned }: { open: boolean; order: Order; onClose: () => void; onAssigned: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const riders = useAsync(() => api.riders.list(), [open]);
  async function assign() { setSaving(true); try { await api.orders.assign(order.id, Number(selected)); onAssigned(); } catch (reason) { toast(apiMessage(reason), "error"); } finally { setSaving(false); } }
  return <Modal open={open} title={order.riderId ? "重新指派骑手" : "指派骑手"} description="只展示已启用且未离线的骑手；服务端会再次校验可用状态。" onClose={onClose}>{riders.loading ? <LoadingState /> : riders.error ? <ErrorState message={apiMessage(riders.error)} retry={riders.reload} /> : <><div className="rider-picker">{riders.data?.riders.filter((rider) => rider.active && rider.status !== "offline").map((rider) => <button type="button" key={rider.id} className={selected === String(rider.id) ? "rider-choice selected" : "rider-choice"} onClick={() => setSelected(String(rider.id))}><span className="avatar avatar-soft">{rider.name.slice(0, 2)}</span><span><strong>{rider.name}</strong><small>{rider.status === "available" ? "可接单" : "配送中 · 可追加派单"} · {rider.phone}</small></span><i /></button>)}</div>{!riders.data?.riders.some((rider) => rider.active && rider.status !== "offline") ? <EmptyState title="没有可派骑手" description="请先将骑手调整为可接单状态" /> : null}<div className="form-actions"><Button kind="ghost" onClick={onClose}>取消</Button><Button disabled={!selected} loading={saving} onClick={assign}>确认指派</Button></div></>}</Modal>;
}

function OrderTimeline({ events }: { events: OrderEvent[] }) { return <ol className="timeline">{events.map((event, index) => <li key={event.id} className={index === events.length - 1 ? "current" : ""}><span><Clock3 size={15} /></span><div><strong>{eventLabels[event.eventType] ?? event.eventType}</strong><p>{event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus ? `${statusLabel[event.fromStatus]} → ${statusLabel[event.toStatus]}` : event.actorName ? `操作人：${event.actorName}` : "系统记录"}</p><small>{fullDatetime(event.createdAt)}</small></div></li>)}</ol>; }

function Progress({ status }: { status: OrderStatus }) { const steps: OrderStatus[] = ["pending", "assigned", "accepted", "picked_up", "delivered"]; const index = status === "cancelled" ? -1 : steps.indexOf(status); return <div className={`order-progress ${status === "cancelled" ? "cancelled" : ""}`}>{steps.map((step, stepIndex) => <div key={step} className={stepIndex <= index ? "done" : ""}><i>{stepIndex + 1}</i><span>{statusLabel[step]}</span></div>)}</div>; }
function actionLabel(status: OrderStatus) { return status === "accepted" ? "确认接单" : status === "picked_up" ? "确认取货" : status === "delivered" ? "确认送达" : "确认更新"; }
function statusHeadline(status: OrderStatus) { return ({ pending: "订单正在等待派单", assigned: "骑手已收到配送任务", accepted: "骑手已接单，准备取货", picked_up: "物品已取，正在配送", delivered: "本次配送已顺利完成", cancelled: "订单已取消" } satisfies Record<OrderStatus, string>)[status]; }
function statusDescription(status: OrderStatus, order: Order) { if (status === "cancelled") return order.cancellationReason || "相关费用已按规则处理"; if (status === "delivered") return `送达时间：${fullDatetime(order.deliveredAt)}`; if (status === "pending") return "运营人员将从可用骑手中完成指派"; return order.riderName ? `配送骑手：${order.riderName}` : "等待配送进度更新"; }
