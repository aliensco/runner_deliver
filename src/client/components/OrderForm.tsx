import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Calculator, MapPin, PackageOpen, Route, UserRound } from "lucide-react";
import { Button, ErrorState, Field, LoadingState } from "./ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { apiMessage, distance, money } from "../lib/format";
import type { Merchant, Order, PricingRule, User } from "../lib/types";

interface OrderFormValue {
  merchantId: string;
  pricingRuleId: string;
  pickupAddress: string;
  deliveryAddress: string;
  recipientName: string;
  recipientPhone: string;
  itemsDescription: string;
  distanceKm: string;
}

const emptyValue: OrderFormValue = {
  merchantId: "",
  pricingRuleId: "",
  pickupAddress: "",
  deliveryAddress: "",
  recipientName: "",
  recipientPhone: "",
  itemsDescription: "",
  distanceKm: "3"
};

export function OrderForm({
  user,
  initial,
  onSaved,
  onCancel,
  compact = false
}: {
  user: User;
  initial?: Order;
  onSaved: (order: Order) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [value, setValue] = useState<OrderFormValue>(() => initial ? {
    merchantId: String(initial.merchantId),
    pricingRuleId: String(initial.pricingRuleId),
    pickupAddress: initial.pickupAddress,
    deliveryAddress: initial.deliveryAddress,
    recipientName: initial.recipientName,
    recipientPhone: initial.recipientPhone,
    itemsDescription: initial.itemsDescription,
    distanceKm: String(initial.distanceMeters / 1000)
  } : emptyValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const resources = useAsync(async () => {
    const [merchantResponse, ruleResponse] = await Promise.all([
      user.role === "admin" ? api.merchants.list() : Promise.resolve({ merchants: [] as Merchant[] }),
      api.pricingRules.list()
    ]);
    return { merchants: merchantResponse.merchants, rules: ruleResponse.pricingRules };
  }, [user.role]);

  useEffect(() => {
    if (!resources.data || initial) return;
    const activeRules = resources.data.rules.filter((rule) => rule.active);
    setValue((current) => ({
      ...current,
      merchantId: current.merchantId || String(user.merchantId ?? resources.data!.merchants.find((merchant) => merchant.active)?.id ?? ""),
      pricingRuleId: current.pricingRuleId || String(activeRules[0]?.id ?? "")
    }));
  }, [resources.data, initial, user.merchantId]);

  const selectedRule = resources.data?.rules.find((rule) => rule.id === Number(value.pricingRuleId));
  const estimate = useMemo(() => calculateEstimate(selectedRule, Math.max(0, Math.round(Number(value.distanceKm || 0) * 1000))), [selectedRule, value.distanceKm]);

  function change<K extends keyof OrderFormValue>(key: K, next: OrderFormValue[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = initial
        ? await api.orders.update(initial.id, {
            pickupAddress: value.pickupAddress.trim(),
            deliveryAddress: value.deliveryAddress.trim(),
            recipientName: value.recipientName.trim(),
            recipientPhone: value.recipientPhone.trim(),
            itemsDescription: value.itemsDescription.trim()
          })
        : await api.orders.create(
            {
              ...(user.role === "admin" ? { merchantId: Number(value.merchantId) } : {}),
              pricingRuleId: Number(value.pricingRuleId),
              pickupAddress: value.pickupAddress.trim(),
              deliveryAddress: value.deliveryAddress.trim(),
              recipientName: value.recipientName.trim(),
              recipientPhone: value.recipientPhone.trim(),
              itemsDescription: value.itemsDescription.trim(),
              distanceMeters: Math.round(Number(value.distanceKm) * 1000)
            },
            { headers: { "Idempotency-Key": idempotencyKey } }
          );
      onSaved(response.order);
    } catch (reason) {
      setError(apiMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  if (resources.loading) return <LoadingState label="正在准备发单信息" />;
  if (resources.error || !resources.data) return <ErrorState message={apiMessage(resources.error)} retry={resources.reload} />;
  const activeRules = resources.data.rules.filter((rule) => rule.active || rule.id === initial?.pricingRuleId);

  return (
    <form className={`order-form ${compact ? "order-form-compact" : ""}`} onSubmit={save}>
      {!initial && user.role === "admin" ? (
        <Field label="下单商户" required full>
          <select value={value.merchantId} onChange={(event) => change("merchantId", event.target.value)} required>
            <option value="">选择商户</option>
            {resources.data.merchants.filter((merchant) => merchant.active).map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name} · 余额 {money(merchant.balanceCents)}</option>)}
          </select>
        </Field>
      ) : null}

      <div className="form-section-heading"><span className="section-number">01</span><span><strong>配送路线</strong><small>填写实际取送地址与预估距离</small></span></div>
      <div className="form-grid">
        <Field label="取货地址" required full><div className="input-affix"><MapPin size={17} /><input value={value.pickupAddress} onChange={(event) => change("pickupAddress", event.target.value)} placeholder="例如：创业路 1 号演示烘焙店" maxLength={500} required /></div></Field>
        <Field label="送达地址" required full><div className="input-affix"><Route size={17} /><input value={value.deliveryAddress} onChange={(event) => change("deliveryAddress", event.target.value)} placeholder="例如：科技园 B 座前台" maxLength={500} required /></div></Field>
        {!initial ? <Field label="预估距离（公里）" hint="用于服务端计价，最终费用以创建结果为准" required><input type="number" min="0" max="1000" step="0.1" value={value.distanceKm} onChange={(event) => change("distanceKm", event.target.value)} required /></Field> : null}
        {!initial ? <Field label="计价规则" required><select value={value.pricingRuleId} onChange={(event) => change("pricingRuleId", event.target.value)} required><option value="">选择计价规则</option>{activeRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select></Field> : null}
      </div>

      <div className="form-section-heading"><span className="section-number">02</span><span><strong>收货信息</strong><small>骑手履约时会使用这些信息</small></span></div>
      <div className="form-grid">
        <Field label="收货人" required><div className="input-affix"><UserRound size={17} /><input value={value.recipientName} onChange={(event) => change("recipientName", event.target.value)} maxLength={100} required /></div></Field>
        <Field label="联系电话" required><input type="tel" value={value.recipientPhone} onChange={(event) => change("recipientPhone", event.target.value)} maxLength={50} required /></Field>
        <Field label="物品与备注" full><textarea rows={3} value={value.itemsDescription} onChange={(event) => change("itemsDescription", event.target.value)} maxLength={1000} placeholder="例如：生日蛋糕 1 个，请轻拿轻放" /></Field>
      </div>

      {!initial && selectedRule ? (
        <div className="price-estimate">
          <span className="estimate-icon"><Calculator /></span>
          <span><small>费用预估 · {selectedRule.name}</small><strong>{money(estimate.charge)}</strong><em>{distance(Math.round(Number(value.distanceKm || 0) * 1000))} · 骑手预计 {money(estimate.payout)}</em></span>
        </div>
      ) : null}
      {error ? <div className="form-error">{error}</div> : null}
      <div className="form-actions sticky-actions">
        <Button type="button" kind="ghost" onClick={onCancel}>取消</Button>
        <Button type="submit" loading={saving}><PackageOpen size={17} />{initial ? "保存修改" : "确认创建"}</Button>
      </div>
    </form>
  );
}

function calculateEstimate(rule: PricingRule | undefined, meters: number) {
  if (!rule) return { charge: 0, payout: 0 };
  const extraKm = Math.ceil(Math.max(0, meters - rule.baseDistanceMeters) / 1000);
  const charge = Math.max(rule.minimumFeeCents, rule.baseFeeCents + extraKm * rule.perKmCents);
  return { charge, payout: Math.round(charge * rule.riderSharePercent / 100) };
}

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
