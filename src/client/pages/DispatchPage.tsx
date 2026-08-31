import { useMemo, useState } from "react";
import { Bike, CheckCircle2, Clock3, Layers3, LocateFixed, MapPin, Navigation, RefreshCw, Route, Sparkles, UserCheck } from "lucide-react";
import { useToast } from "../components/toast";
import { Badge, Button, EmptyState, ErrorState, LoadingState, Modal, PageHeader, Panel } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { apiMessage, datetime, distance, money, riderStatusLabel } from "../lib/format";
import type { Order, Rider } from "../lib/types";

export function DispatchPage() {
  const toast = useToast();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const result = useAsync(async () => {
    const [orders, riders] = await Promise.all([api.orders.list({ status: "pending", limit: 100 }), api.riders.list()]);
    return { orders: orders.orders, riders: riders.riders };
  }, []);
  const selectedOrder = result.data?.orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedRider = result.data?.riders.find((rider) => rider.id === selectedRiderId) ?? null;
  const available = useMemo(() => result.data?.riders.filter((rider) => rider.active && rider.status !== "offline") ?? [], [result.data]);

  async function assign() {
    if (!selectedOrder || !selectedRider) return;
    setAssigning(true);
    try {
      await api.orders.assign(selectedOrder.id, selectedRider.id);
      toast(`已将 ${selectedOrder.orderNo} 指派给 ${selectedRider.name}`);
      setConfirmOpen(false); setSelectedOrderId(null); setSelectedRiderId(null); result.reload();
    } catch (reason) { toast(apiMessage(reason), "error"); } finally { setAssigning(false); }
  }

  return (
    <>
      <PageHeader eyebrow="实时运营" title="智能调度台" description="选择一笔待派订单和可用骑手，确认后由服务端完成指派。" actions={<Button kind="secondary" onClick={result.reload}><RefreshCw size={16} />刷新</Button>} />
      {result.loading ? <LoadingState label="正在同步调度数据" /> : result.error || !result.data ? <ErrorState message={apiMessage(result.error)} retry={result.reload} /> : (
        <div className="dispatch-layout">
          <Panel title="待派订单" subtitle={`${result.data.orders.length} 笔等待指派`} className="dispatch-orders">
            <div className="dispatch-scroll">
              {result.data.orders.map((order) => <DispatchOrder key={order.id} order={order} selected={order.id === selectedOrderId} onClick={() => setSelectedOrderId(order.id)} />)}
              {!result.data.orders.length ? <EmptyState title="待派订单已清空" description="目前没有需要人工指派的订单" /> : null}
            </div>
          </Panel>

          <section className="dispatch-map-panel">
            <div className="map-toolbar"><span><Layers3 size={17} />本地调度示意图</span><span className="map-note"><i />不代表实时定位</span></div>
            <div className="mock-map">
              <div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><div className="map-water" />
              <span className="map-label label-park">创智公园</span><span className="map-label label-road">启航大道</span><span className="map-label label-zone">中央商务区</span>
              {result.data.orders.slice(0, 7).map((order, index) => <button key={order.id} className={`map-pin order-pin pin-${index + 1} ${order.id === selectedOrderId ? "active" : ""}`} onClick={() => setSelectedOrderId(order.id)} title={order.orderNo}><MapPin size={18} /><span>{index + 1}</span></button>)}
              {available.slice(0, 6).map((rider, index) => <button key={rider.id} className={`map-rider rider-${index + 1} ${rider.id === selectedRiderId ? "active" : ""}`} onClick={() => setSelectedRiderId(rider.id)} title={rider.name}><Bike size={17} /></button>)}
              <div className="map-legend"><span><i className="legend-order" />待派订单</span><span><i className="legend-rider" />可派骑手</span></div>
            </div>
            <div className="dispatch-selection">
              <div className={selectedOrder ? "selected-entity ready" : "selected-entity"}><span><MapPin /></span><div><small>配送订单</small><strong>{selectedOrder?.orderNo ?? "请选择待派订单"}</strong>{selectedOrder ? <em>{selectedOrder.deliveryAddress}</em> : null}</div></div>
              <Route className="selection-route" />
              <div className={selectedRider ? "selected-entity ready" : "selected-entity"}><span><Bike /></span><div><small>执行骑手</small><strong>{selectedRider?.name ?? "请选择可用骑手"}</strong>{selectedRider ? <em>{riderStatusLabel[selectedRider.status]} · {selectedRider.phone}</em> : null}</div></div>
              <Button disabled={!selectedOrder || !selectedRider} onClick={() => setConfirmOpen(true)}>确认派单 <Navigation size={17} /></Button>
            </div>
          </section>

          <Panel title="骑手运力" subtitle={`${available.length} 人可参与调度`} className="dispatch-riders">
            <div className="dispatch-scroll">
              {result.data.riders.map((rider) => <RiderChoice key={rider.id} rider={rider} selected={rider.id === selectedRiderId} disabled={!rider.active || rider.status === "offline"} onClick={() => setSelectedRiderId(rider.id)} />)}
              {!result.data.riders.length ? <EmptyState title="暂无骑手" description="请先在骑手管理中添加运力" /> : null}
            </div>
          </Panel>
        </div>
      )}
      <Modal open={confirmOpen} title="确认指派" description="指派后订单将进入待接单状态，骑手状态会同步更新。" onClose={() => setConfirmOpen(false)}>
        {selectedOrder && selectedRider ? <div className="assign-summary"><div><span className="summary-icon"><MapPin /></span><span><small>订单</small><strong>{selectedOrder.orderNo}</strong><em>{selectedOrder.pickupAddress} → {selectedOrder.deliveryAddress}</em></span></div><div className="summary-divider"><Route /></div><div><span className="summary-icon rider"><Bike /></span><span><small>骑手</small><strong>{selectedRider.name}</strong><em>{selectedRider.phone} · {riderStatusLabel[selectedRider.status]}</em></span></div></div> : null}
        <div className="form-actions"><Button kind="ghost" onClick={() => setConfirmOpen(false)}>返回</Button><Button loading={assigning} onClick={assign}>确认派单</Button></div>
      </Modal>
    </>
  );
}

function DispatchOrder({ order, selected, onClick }: { order: Order; selected: boolean; onClick: () => void }) {
  return <button className={`dispatch-order ${selected ? "selected" : ""}`} onClick={onClick}><div className="dispatch-order-top"><span>{order.orderNo}</span><Badge tone="pending" dot>待派单</Badge></div><strong>{order.deliveryAddress}</strong><p><MapPin size={14} />{order.pickupAddress}</p><footer><span><Clock3 size={14} />{datetime(order.createdAt)}</span><span>{distance(order.distanceMeters)}</span><strong>{money(order.merchantChargeCents)}</strong></footer></button>;
}

function RiderChoice({ rider, selected, disabled, onClick }: { rider: Rider; selected: boolean; disabled: boolean; onClick: () => void }) {
  return <button className={`dispatch-rider ${selected ? "selected" : ""}`} onClick={onClick} disabled={disabled}><span className="rider-avatar">{rider.name.slice(0, 2)}<i className={rider.status} /></span><span><strong>{rider.name}</strong><small>{rider.phone}</small></span><Badge tone={rider.status} dot>{!rider.active ? "已停用" : riderStatusLabel[rider.status]}</Badge>{selected ? <CheckCircle2 className="choice-check" /> : <UserCheck className="choice-arrow" />}</button>;
}
