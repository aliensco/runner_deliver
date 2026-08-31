import { createHash, randomBytes } from "node:crypto";
import type { SqliteDatabase } from "./db";
import { nowIso } from "./db";
import { AppError } from "./errors";

export type OrderStatus =
  | "pending"
  | "assigned"
  | "accepted"
  | "picked_up"
  | "delivered"
  | "cancelled";

export interface Actor {
  id: number;
  role: "admin" | "merchant" | "rider";
  merchantId: number | null;
  riderId: number | null;
}

export interface OrderRow {
  id: number;
  order_no: string;
  merchant_id: number;
  merchant_name: string;
  rider_id: number | null;
  rider_name: string | null;
  pricing_rule_id: number;
  pricing_rule_name: string;
  status: OrderStatus;
  pickup_address: string;
  delivery_address: string;
  recipient_name: string;
  recipient_phone: string;
  items_description: string;
  distance_meters: number;
  merchant_charge_cents: number;
  rider_payout_cents: number;
  cancellation_reason: string | null;
  created_by_user_id: number;
  assigned_at: string | null;
  accepted_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  merchant_refunded_at: string | null;
  rider_paid_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PricingRuleRow {
  id: number;
  name: string;
  base_fee_cents: number;
  base_distance_meters: number;
  per_km_cents: number;
  minimum_fee_cents: number;
  rider_share_percent: number;
  active: number;
}

interface CoreOrderRow {
  id: number;
  merchant_id: number;
  rider_id: number | null;
  status: OrderStatus;
  merchant_charge_cents: number;
  rider_payout_cents: number;
  merchant_refunded_at: string | null;
  rider_paid_at: string | null;
}

type SettlementEntryType = "order_refund" | "delivery_payout";

interface SettlementLedgerRow {
  account_type: "merchant" | "rider";
  merchant_id: number | null;
  rider_id: number | null;
  order_id: number | null;
  entry_type: string;
  amount_cents: number;
  idempotency_key: string;
}

interface SettlementExpectation {
  accountType: "merchant" | "rider";
  merchantId: number | null;
  riderId: number | null;
  orderId: number;
  entryType: SettlementEntryType;
  amountCents: number;
  idempotencyKey: string;
  description: string;
  createdByUserId: number;
  createdAt: string;
}

const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ["assigned", "cancelled"],
  assigned: ["accepted", "cancelled"],
  accepted: ["picked_up", "cancelled"],
  picked_up: ["delivered"],
  delivered: [],
  cancelled: []
};

const orderSelect = `
  SELECT o.*, m.name AS merchant_name, r.name AS rider_name,
         p.name AS pricing_rule_name
  FROM orders o
  JOIN merchants m ON m.id = o.merchant_id
  LEFT JOIN riders r ON r.id = o.rider_id
  JOIN pricing_rules p ON p.id = o.pricing_rule_id
`;

function settlementMatches(
  row: SettlementLedgerRow,
  expected: SettlementExpectation
): boolean {
  return (
    row.account_type === expected.accountType &&
    row.merchant_id === expected.merchantId &&
    row.rider_id === expected.riderId &&
    row.order_id === expected.orderId &&
    row.entry_type === expected.entryType &&
    row.amount_cents === expected.amountCents &&
    row.idempotency_key === expected.idempotencyKey
  );
}

function insertOrVerifySettlement(
  db: SqliteDatabase,
  expected: SettlementExpectation
): boolean {
  const existing = db
    .prepare(
      `SELECT account_type, merchant_id, rider_id, order_id, entry_type,
              amount_cents, idempotency_key
       FROM ledger_entries
       WHERE idempotency_key = ? OR (order_id = ? AND entry_type = ?)`
    )
    .all(expected.idempotencyKey, expected.orderId, expected.entryType) as SettlementLedgerRow[];
  if (existing.length > 0) {
    if (existing.length === 1 && settlementMatches(existing[0], expected)) return false;
    throw new AppError(
      409,
      "Existing ledger data conflicts with the requested order settlement",
      "SETTLEMENT_CONFLICT"
    );
  }

  db.prepare(
    `INSERT INTO ledger_entries
      (account_type, merchant_id, rider_id, order_id, entry_type, amount_cents,
       idempotency_key, description, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    expected.accountType,
    expected.merchantId,
    expected.riderId,
    expected.orderId,
    expected.entryType,
    expected.amountCents,
    expected.idempotencyKey,
    expected.description,
    expected.createdByUserId,
    expected.createdAt
  );
  return true;
}

function recordEvent(
  db: SqliteDatabase,
  orderId: number,
  actorUserId: number | null,
  eventType: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus | null,
  metadata: Record<string, unknown> = {}
): void {
  db.prepare(
    `INSERT INTO order_events
      (order_id, actor_user_id, event_type, from_status, to_status,
       metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    orderId,
    actorUserId,
    eventType,
    fromStatus,
    toStatus,
    JSON.stringify(metadata),
    nowIso()
  );
}

function getCoreOrder(db: SqliteDatabase, orderId: number): CoreOrderRow {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as
    | CoreOrderRow
    | undefined;
  if (!row) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
  return row;
}

export function getOrder(db: SqliteDatabase, orderId: number): OrderRow {
  const row = db.prepare(`${orderSelect} WHERE o.id = ?`).get(orderId) as
    | OrderRow
    | undefined;
  if (!row) throw new AppError(404, "Order not found", "ORDER_NOT_FOUND");
  return row;
}

export function assertCanViewOrder(order: OrderRow, actor: Actor): void {
  if (actor.role === "admin") return;
  if (actor.role === "merchant" && actor.merchantId === order.merchant_id) return;
  if (actor.role === "rider" && actor.riderId === order.rider_id) return;
  throw new AppError(403, "You cannot access this order", "ORDER_FORBIDDEN");
}

export function calculatePrice(
  rule: PricingRuleRow,
  distanceMeters: number
): { merchantChargeCents: number; riderPayoutCents: number } {
  const extraMeters = Math.max(0, distanceMeters - rule.base_distance_meters);
  const extraKilometers = Math.ceil(extraMeters / 1000);
  const calculated = rule.base_fee_cents + extraKilometers * rule.per_km_cents;
  const merchantChargeCents = Math.max(rule.minimum_fee_cents, calculated);
  return {
    merchantChargeCents,
    riderPayoutCents: Math.round(
      (merchantChargeCents * rule.rider_share_percent) / 100
    )
  };
}

function getPricingRule(
  db: SqliteDatabase,
  requestedRuleId?: number
): PricingRuleRow {
  let ruleId = requestedRuleId;
  if (ruleId === undefined) {
    const setting = db
      .prepare("SELECT value_json FROM system_settings WHERE key = ?")
      .get("default_pricing_rule_id") as { value_json: string } | undefined;
    if (setting) ruleId = Number(JSON.parse(setting.value_json));
  }

  const rule = (ruleId === undefined
    ? db.prepare("SELECT * FROM pricing_rules WHERE active = 1 ORDER BY id LIMIT 1").get()
    : db.prepare("SELECT * FROM pricing_rules WHERE id = ? AND active = 1").get(ruleId)) as
    | PricingRuleRow
    | undefined;
  if (!rule) {
    throw new AppError(409, "No active pricing rule is available", "PRICING_UNAVAILABLE");
  }
  return rule;
}

export interface CreateOrderInput {
  merchantId: number;
  pricingRuleId?: number;
  pickupAddress: string;
  deliveryAddress: string;
  recipientName: string;
  recipientPhone: string;
  itemsDescription: string;
  distanceMeters: number;
}

interface OrderIdempotencyRow {
  request_hash: string;
  order_id: number;
}

function orderRequestHash(input: CreateOrderInput): string {
  const canonicalPayload = JSON.stringify({
    merchantId: input.merchantId,
    pricingRuleId: input.pricingRuleId ?? null,
    pickupAddress: input.pickupAddress,
    deliveryAddress: input.deliveryAddress,
    recipientName: input.recipientName,
    recipientPhone: input.recipientPhone,
    itemsDescription: input.itemsDescription,
    distanceMeters: input.distanceMeters
  });
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

export interface CreateOrderResult {
  order: OrderRow;
  idempotent: boolean;
}

export function createOrder(
  db: SqliteDatabase,
  input: CreateOrderInput,
  actor: Actor,
  idempotencyKey?: string
): CreateOrderResult {
  if (actor.role === "rider") {
    throw new AppError(403, "Riders cannot create orders", "FORBIDDEN");
  }
  if (actor.role === "merchant" && actor.merchantId !== input.merchantId) {
    throw new AppError(403, "Merchants can only create their own orders", "FORBIDDEN");
  }

  const requestHash = idempotencyKey ? orderRequestHash(input) : undefined;
  const create = db.transaction((): { orderId: number; idempotent: boolean } => {
    if (idempotencyKey && requestHash) {
      const existing = db
        .prepare(
          `SELECT request_hash, order_id FROM order_idempotency_keys
           WHERE merchant_id = ? AND idempotency_key = ?`
        )
        .get(input.merchantId, idempotencyKey) as OrderIdempotencyRow | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new AppError(
            409,
            "Idempotency key was already used with different order data",
            "IDEMPOTENCY_CONFLICT"
          );
        }
        return { orderId: existing.order_id, idempotent: true };
      }
    }

    const merchant = db
      .prepare("SELECT id, balance_cents, active FROM merchants WHERE id = ?")
      .get(input.merchantId) as
      | { id: number; balance_cents: number; active: number }
      | undefined;
    if (!merchant || !merchant.active) {
      throw new AppError(404, "Active merchant not found", "MERCHANT_NOT_FOUND");
    }

    const rule = getPricingRule(db, input.pricingRuleId);
    const price = calculatePrice(rule, input.distanceMeters);
    if (merchant.balance_cents < price.merchantChargeCents) {
      throw new AppError(409, "Merchant balance is insufficient", "INSUFFICIENT_BALANCE");
    }

    const now = nowIso();
    const orderNo = `ORD-${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const result = db
      .prepare(
        `INSERT INTO orders
          (order_no, merchant_id, rider_id, pricing_rule_id, status,
           pickup_address, delivery_address, recipient_name, recipient_phone,
           items_description, distance_meters, merchant_charge_cents,
           rider_payout_cents, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, NULL, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        orderNo,
        input.merchantId,
        rule.id,
        input.pickupAddress,
        input.deliveryAddress,
        input.recipientName,
        input.recipientPhone,
        input.itemsDescription,
        input.distanceMeters,
        price.merchantChargeCents,
        price.riderPayoutCents,
        actor.id,
        now,
        now
      );
    const orderId = Number(result.lastInsertRowid);

    if (price.merchantChargeCents > 0) {
      db.prepare(
        "UPDATE merchants SET balance_cents = balance_cents - ?, updated_at = ? WHERE id = ?"
      ).run(price.merchantChargeCents, now, input.merchantId);
      db.prepare(
        `INSERT INTO ledger_entries
          (account_type, merchant_id, rider_id, order_id, entry_type, amount_cents,
           idempotency_key, description, created_by_user_id, created_at)
         VALUES ('merchant', ?, NULL, ?, 'order_charge', ?, ?, ?, ?, ?)`
      ).run(
        input.merchantId,
        orderId,
        -price.merchantChargeCents,
        `order-charge:${orderId}`,
        `Charge for order ${orderNo}`,
        actor.id,
        now
      );
    }
    recordEvent(db, orderId, actor.id, "created", null, "pending", {
      merchantChargeCents: price.merchantChargeCents,
      riderPayoutCents: price.riderPayoutCents,
      pricingRuleId: rule.id
    });
    if (idempotencyKey && requestHash) {
      db.prepare(
        `INSERT INTO order_idempotency_keys
          (merchant_id, idempotency_key, request_hash, order_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(input.merchantId, idempotencyKey, requestHash, orderId, now);
    }
    return { orderId, idempotent: false };
  });

  const result = create();
  return { order: getOrder(db, result.orderId), idempotent: result.idempotent };
}

export type EditableOrderFields = Partial<
  Pick<
    CreateOrderInput,
    | "pickupAddress"
    | "deliveryAddress"
    | "recipientName"
    | "recipientPhone"
    | "itemsDescription"
  >
>;

export function updateOrder(
  db: SqliteDatabase,
  orderId: number,
  input: EditableOrderFields,
  actor: Actor
): OrderRow {
  const update = db.transaction(() => {
    const current = getOrder(db, orderId);
    assertCanViewOrder(current, actor);
    if (actor.role === "rider") {
      throw new AppError(403, "Riders cannot edit order details", "FORBIDDEN");
    }
    if (current.status !== "pending") {
      throw new AppError(409, "Only pending orders can be edited", "ORDER_NOT_EDITABLE");
    }

    const mapping: Record<keyof EditableOrderFields, string> = {
      pickupAddress: "pickup_address",
      deliveryAddress: "delivery_address",
      recipientName: "recipient_name",
      recipientPhone: "recipient_phone",
      itemsDescription: "items_description"
    };
    const entries = Object.entries(input) as Array<
      [keyof EditableOrderFields, string]
    >;
    if (entries.length === 0) {
      throw new AppError(400, "At least one editable field is required", "EMPTY_UPDATE");
    }

    const assignments = entries.map(([key]) => `${mapping[key]} = ?`);
    const values = entries.map(([, value]) => value);
    const now = nowIso();
    db.prepare(
      `UPDATE orders SET ${assignments.join(", ")}, updated_at = ? WHERE id = ?`
    ).run(...values, now, orderId);
    recordEvent(db, orderId, actor.id, "details_updated", current.status, current.status, {
      changedFields: entries.map(([key]) => key)
    });
  });
  update();
  return getOrder(db, orderId);
}

function releaseRiderIfIdle(db: SqliteDatabase, riderId: number, now: string): void {
  const active = db
    .prepare(
      `SELECT COUNT(*) AS count FROM orders
       WHERE rider_id = ? AND status IN ('assigned', 'accepted', 'picked_up')`
    )
    .get(riderId) as { count: number };
  if (active.count === 0) {
    db.prepare(
      "UPDATE riders SET status = 'available', updated_at = ? WHERE id = ? AND active = 1"
    ).run(now, riderId);
  }
}

export function assignOrder(
  db: SqliteDatabase,
  orderId: number,
  riderId: number,
  actor: Actor
): OrderRow {
  if (actor.role !== "admin") {
    throw new AppError(403, "Only administrators can assign orders", "FORBIDDEN");
  }

  const assign = db.transaction(() => {
    const order = getCoreOrder(db, orderId);
    if (!(["pending", "assigned", "accepted"] as OrderStatus[]).includes(order.status)) {
      throw new AppError(409, "This order cannot be assigned in its current state", "INVALID_TRANSITION");
    }
    const rider = db
      .prepare("SELECT id, active, status FROM riders WHERE id = ?")
      .get(riderId) as { id: number; active: number; status: string } | undefined;
    if (!rider || !rider.active || rider.status === "offline") {
      throw new AppError(409, "Rider is not available for assignment", "RIDER_UNAVAILABLE");
    }

    const previousRiderId = order.rider_id;
    const now = nowIso();
    db.prepare(
      `UPDATE orders
       SET rider_id = ?, status = 'assigned', assigned_at = ?, accepted_at = NULL, updated_at = ?
       WHERE id = ?`
    ).run(riderId, now, now, orderId);
    db.prepare("UPDATE riders SET status = 'busy', updated_at = ? WHERE id = ?").run(
      now,
      riderId
    );
    if (previousRiderId && previousRiderId !== riderId) {
      releaseRiderIfIdle(db, previousRiderId, now);
    }
    recordEvent(
      db,
      orderId,
      actor.id,
      order.status === "pending" ? "assigned" : "reassigned",
      order.status,
      "assigned",
      { riderId, previousRiderId }
    );
  });
  assign();
  return getOrder(db, orderId);
}

function assertCanTransition(order: CoreOrderRow, target: OrderStatus, actor: Actor): void {
  if (actor.role === "admin") {
    if (target === "cancelled") return;
    throw new AppError(403, "Only the assigned rider can advance fulfillment", "FORBIDDEN");
  }
  if (actor.role === "merchant") {
    if (actor.merchantId === order.merchant_id && target === "cancelled") return;
    throw new AppError(403, "Merchants may only cancel their own uncollected orders", "FORBIDDEN");
  }
  if (
    actor.role === "rider" &&
    actor.riderId === order.rider_id &&
    (target === "accepted" || target === "picked_up" || target === "delivered")
  ) {
    return;
  }
  throw new AppError(403, "Rider is not assigned to this transition", "FORBIDDEN");
}

export function transitionOrder(
  db: SqliteDatabase,
  orderId: number,
  targetStatus: OrderStatus,
  actor: Actor,
  cancellationReason?: string
): { order: OrderRow; idempotent: boolean } {
  let idempotent = false;
  const transition = db.transaction(() => {
    const order = getCoreOrder(db, orderId);
    assertCanTransition(order, targetStatus, actor);

    if (order.status === targetStatus) {
      idempotent = true;
      return;
    }
    if (!transitions[order.status].includes(targetStatus)) {
      throw new AppError(
        409,
        `Cannot transition order from ${order.status} to ${targetStatus}`,
        "INVALID_TRANSITION"
      );
    }
    if (targetStatus === "cancelled" && order.status === "picked_up") {
      throw new AppError(409, "Collected orders cannot be cancelled", "INVALID_TRANSITION");
    }
    if (
      (targetStatus === "accepted" || targetStatus === "picked_up" || targetStatus === "delivered") &&
      !order.rider_id
    ) {
      throw new AppError(409, "Order has no assigned rider", "RIDER_REQUIRED");
    }

    const now = nowIso();
    if (targetStatus === "cancelled") {
      if (!cancellationReason?.trim()) {
        throw new AppError(400, "Cancellation reason is required", "CANCELLATION_REASON_REQUIRED");
      }
      if (!order.merchant_refunded_at && order.merchant_charge_cents > 0) {
        const inserted = insertOrVerifySettlement(db, {
          accountType: "merchant",
          merchantId: order.merchant_id,
          riderId: null,
          orderId: order.id,
          entryType: "order_refund",
          amountCents: order.merchant_charge_cents,
          idempotencyKey: `order-refund:${order.id}`,
          description: `Refund for cancelled order ${order.id}`,
          createdByUserId: actor.id,
          createdAt: now
        });
        if (inserted) {
          db.prepare(
            "UPDATE merchants SET balance_cents = balance_cents + ?, updated_at = ? WHERE id = ?"
          ).run(order.merchant_charge_cents, now, order.merchant_id);
        }
      }
      db.prepare(
        `UPDATE orders
         SET status = 'cancelled', cancellation_reason = ?, cancelled_at = ?,
             merchant_refunded_at = COALESCE(merchant_refunded_at, ?), updated_at = ?
         WHERE id = ?`
      ).run(cancellationReason.trim(), now, now, now, order.id);
      if (order.rider_id) releaseRiderIfIdle(db, order.rider_id, now);
    } else if (targetStatus === "accepted") {
      db.prepare(
        `UPDATE orders SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, order.id);
    } else if (targetStatus === "picked_up") {
      db.prepare(
        `UPDATE orders
         SET status = 'picked_up', picked_up_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, order.id);
    } else if (targetStatus === "delivered") {
      if (!order.rider_id) {
        throw new AppError(409, "Order has no assigned rider", "RIDER_REQUIRED");
      }
      if (!order.rider_paid_at && order.rider_payout_cents > 0) {
        const inserted = insertOrVerifySettlement(db, {
          accountType: "rider",
          merchantId: null,
          riderId: order.rider_id,
          orderId: order.id,
          entryType: "delivery_payout",
          amountCents: order.rider_payout_cents,
          idempotencyKey: `delivery-payout:${order.id}`,
          description: `Delivery payout for order ${order.id}`,
          createdByUserId: actor.id,
          createdAt: now
        });
        if (inserted) {
          db.prepare(
            "UPDATE riders SET balance_cents = balance_cents + ?, updated_at = ? WHERE id = ?"
          ).run(order.rider_payout_cents, now, order.rider_id);
        }
      }
      db.prepare(
        `UPDATE orders
         SET status = 'delivered', delivered_at = ?,
             rider_paid_at = COALESCE(rider_paid_at, ?), updated_at = ?
         WHERE id = ?`
      ).run(now, now, now, order.id);
      releaseRiderIfIdle(db, order.rider_id, now);
    } else {
      throw new AppError(409, "Use the assignment endpoint to assign an order", "ASSIGNMENT_REQUIRED");
    }

    recordEvent(db, order.id, actor.id, "status_changed", order.status, targetStatus, {
      cancellationReason: targetStatus === "cancelled" ? cancellationReason : undefined
    });
  });

  transition();
  return { order: getOrder(db, orderId), idempotent };
}

export function listOrders(
  db: SqliteDatabase,
  actor: Actor,
  filters: { status?: OrderStatus; merchantId?: number; riderId?: number; limit: number; offset: number }
): { orders: OrderRow[]; total: number } {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (actor.role === "merchant") {
    where.push("o.merchant_id = ?");
    params.push(actor.merchantId!);
  } else if (actor.role === "rider") {
    where.push("o.rider_id = ?");
    params.push(actor.riderId!);
  } else {
    if (filters.merchantId !== undefined) {
      where.push("o.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.riderId !== undefined) {
      where.push("o.rider_id = ?");
      params.push(filters.riderId);
    }
  }
  if (filters.status) {
    where.push("o.status = ?");
    params.push(filters.status);
  }
  const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const orders = db
    .prepare(`${orderSelect}${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, filters.limit, filters.offset) as OrderRow[];
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM orders o${whereSql}`)
      .get(...params) as { count: number }
  ).count;
  return { orders, total };
}

export function getOrderEvents(db: SqliteDatabase, orderId: number): unknown[] {
  return db
    .prepare(
      `SELECT e.id, e.order_id, e.actor_user_id, e.event_type, e.from_status,
              e.to_status, e.metadata_json, e.created_at, u.display_name AS actor_name
       FROM order_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.order_id = ? ORDER BY e.id ASC`
    )
    .all(orderId);
}
