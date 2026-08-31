import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Filter, MapPin, PackageOpen, Plus, Search } from "lucide-react";
import { OrderForm } from "../components/OrderForm";
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { apiMessage, datetime, distance, money } from "../lib/format";
import type { OrderStatus, User } from "../lib/types";
import { useToast } from "../components/toast";

const statusOptions: Array<{ value: "" | OrderStatus; label: string }> = [
  { value: "", label: "全部状态" }, { value: "pending", label: "待派单" }, { value: "assigned", label: "待接单" },
  { value: "accepted", label: "待取货" }, { value: "picked_up", label: "配送中" }, { value: "delivered", label: "已送达" }, { value: "cancelled", label: "已取消" }
];

export function OrdersPage({ user }: { user: User }) {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "") as "" | OrderStatus;
  const offset = Math.max(0, Number(params.get("offset") ?? 0));
  const [search, setSearch] = useState("");
  const result = useAsync(() => api.orders.list({ status: status || undefined, limit: 20, offset }), [status, offset]);
  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return result.data?.orders ?? [];
    return (result.data?.orders ?? []).filter((order) => [order.orderNo, order.merchantName, order.riderName, order.recipientName, order.recipientPhone, order.pickupAddress, order.deliveryAddress].some((value) => value?.toLowerCase().includes(term)));
  }, [result.data, search]);
  const total = result.data?.pagination.total ?? 0;

  function updateParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "offset") next.delete("offset");
    setParams(next);
  }

  return (
    <>
      <PageHeader eyebrow={user.role === "merchant" ? "商户订单" : "配送履约"} title={user.role === "merchant" ? "我的订单" : "订单管理"} description={`共 ${total} 笔订单，状态与资金流转均以服务端记录为准。`} actions={user.role !== "rider" ? <Link to="/orders/new" className="button button-primary button-md"><Plus size={17} />新建订单</Link> : undefined} />
      <Panel className="table-panel">
        <div className="filter-bar">
          <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索订单号、地址、收货人" /></div>
          <label className="select-filter"><Filter size={16} /><select value={status} onChange={(event) => updateParam("status", event.target.value)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <span className="filter-count">本页 {displayed.length} 条</span>
        </div>
        {result.loading ? <LoadingState /> : result.error ? <ErrorState message={apiMessage(result.error)} retry={result.reload} /> : !displayed.length ? <EmptyState title={search ? "没有匹配的订单" : "暂无订单"} description={search ? "换个关键词或清除筛选后再试" : "创建订单后，记录会出现在这里"} /> : (
          <>
            <div className="data-table-wrap">
              <table className="data-table orders-table">
                <thead><tr><th>订单</th><th>配送路线</th>{user.role === "admin" ? <th>商户 / 骑手</th> : null}<th>费用</th><th>状态</th><th>创建时间</th><th /></tr></thead>
                <tbody>{displayed.map((order) => <tr key={order.id}><td><Link className="order-number" to={`/orders/${order.id}`}>{order.orderNo}</Link><small>{order.recipientName} · {order.recipientPhone}</small></td><td><div className="route-cell"><MapPin size={15} /><span><strong>{order.pickupAddress}</strong><small>送至 {order.deliveryAddress} · {distance(order.distanceMeters)}</small></span></div></td>{user.role === "admin" ? <td><strong>{order.merchantName}</strong><small>{order.riderName ?? "暂未指派"}</small></td> : null}<td><strong>{money(order.merchantChargeCents)}</strong><small>{user.role === "rider" ? `预计收入 ${money(order.riderPayoutCents)}` : "配送费用"}</small></td><td><StatusBadge status={order.status} /></td><td>{datetime(order.createdAt)}</td><td><Link className="table-arrow" to={`/orders/${order.id}`} aria-label="查看详情"><ArrowRight size={17} /></Link></td></tr>)}</tbody>
              </table>
            </div>
            <div className="mobile-order-list">{displayed.map((order) => <Link to={`/orders/${order.id}`} className="mobile-order-card" key={order.id}><div><span className="order-number">{order.orderNo}</span><StatusBadge status={order.status} /></div><strong>{order.deliveryAddress}</strong><span><MapPin size={14} />{order.pickupAddress}</span><footer><span>{datetime(order.createdAt)}</span><strong>{user.role === "rider" ? money(order.riderPayoutCents) : money(order.merchantChargeCents)}</strong></footer></Link>)}</div>
            <div className="pagination"><span>第 {Math.floor(offset / 20) + 1} 页 · 共 {total} 条</span><div><Button size="sm" kind="secondary" disabled={offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - 20)))}><ArrowLeft size={15} />上一页</Button><Button size="sm" kind="secondary" disabled={offset + 20 >= total} onClick={() => updateParam("offset", String(offset + 20))}>下一页<ArrowRight size={15} /></Button></div></div>
          </>
        )}
      </Panel>
    </>
  );
}

export function CreateOrderPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <>
      <PageHeader eyebrow="发起配送" title="创建配送订单" description="填写配送信息，系统将按实际计价规则扣除商户余额。" actions={<Button kind="ghost" onClick={() => navigate(-1)}><ArrowLeft size={17} />返回</Button>} />
      <Panel className="form-panel"><OrderForm user={user} onCancel={() => navigate(-1)} onSaved={(order) => { toast("订单创建成功"); navigate(`/orders/${order.id}`, { replace: true }); }} /></Panel>
    </>
  );
}
