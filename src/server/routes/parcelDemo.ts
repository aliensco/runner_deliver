import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { AppConfig } from "../config";
import type { SqliteDatabase } from "../db";
import { nowIso } from "../db";
import { AppError } from "../errors";
import { createOrder, getOrder, getOrderEvents, transitionOrder, type Actor } from "../orders";

const sourceUser = z.string().regex(/^[1-9]\d{0,15}$/);
const inputSchema = z.object({
  sourceUserId: sourceUser,
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/),
  campusId: z.number().int().positive(),
  campusName: z.string().trim().min(1).max(150),
  pickupAddress: z.string().trim().min(2).max(300),
  pickupCode: z.string().trim().min(1).max(100),
  parcelCount: z.number().int().min(1).max(5),
  deliveryAddress: z.string().trim().min(2).max(300),
  recipientName: z.string().trim().min(1).max(50),
  recipientPhone: z.string().regex(/^1[3-9]\d{9}$/),
  remark: z.string().trim().max(300).default("")
}).strict();

type Resources = { merchant_id: number; user_id: number; pricing_rule_id: number };
type Parcel = { order_id: number; source_user_id: string; request_hash: string; campus_id: number; campus_name: string; pickup_code: string; parcel_count: number };

function resources(db: SqliteDatabase): Resources {
  const existing = db.prepare("SELECT * FROM parcel_demo_resources WHERE id = 1").get() as Resources | undefined;
  if (existing) return existing;
  // Dedicated zero-price demo tenant: never debit real merchants or credit real income.
  return db.transaction(() => {
    const now = nowIso();
    const merchantId = Number(db.prepare("INSERT INTO merchants (name, contact_name, phone, address, balance_cents, active, created_at, updated_at) VALUES (?, ?, ?, '', 0, 1, ?, ?)")
      .run("易在校园·代取演示", "演示运营", "未配置", now, now).lastInsertRowid);
    const pricingId = Number(db.prepare("INSERT INTO pricing_rules (name, base_fee_cents, base_distance_meters, per_km_cents, minimum_fee_cents, rider_share_percent, active, created_at, updated_at) VALUES (?, 0, 0, 0, 0, 0, 1, ?, ?)")
      .run("快递代取演示·不收费", now, now).lastInsertRowid);
    const userId = Number(db.prepare("INSERT INTO users (username, password_hash, role, display_name, merchant_id, active, created_at, updated_at) VALUES (?, ?, 'merchant', ?, ?, 1, ?, ?)")
      .run(`parcel_service_${randomBytes(12).toString("hex")}`, "!service-account-no-password-login", "小程序代取演示服务", merchantId, now, now).lastInsertRowid);
    db.prepare("INSERT INTO parcel_demo_resources VALUES (1, ?, ?, ?)").run(merchantId, userId, pricingId);
    return { merchant_id: merchantId, user_id: userId, pricing_rule_id: pricingId };
  })();
}

function actor(value: Resources): Actor {
  return { id: value.user_id, role: "merchant", merchantId: value.merchant_id, riderId: null };
}

function owned(db: SqliteDatabase, id: number, userId: string): Parcel {
  const row = db.prepare("SELECT * FROM parcel_demo_orders WHERE order_id = ? AND source_user_id = ?").get(id, userId) as Parcel | undefined;
  if (!row) throw new AppError(404, "代取订单不存在", "ORDER_NOT_FOUND");
  return row;
}

function dto(db: SqliteDatabase, parcel: Parcel, detail = false) {
  const order = getOrder(db, parcel.order_id);
  return {
    id: order.id, orderNo: order.order_no, status: order.status,
    campusId: parcel.campus_id, campusName: parcel.campus_name,
    pickupAddress: order.pickup_address, deliveryAddress: order.delivery_address,
    recipientName: order.recipient_name, recipientPhone: order.recipient_phone,
    parcelCount: parcel.parcel_count, riderName: order.rider_name,
    demo: true, feeCents: 0, createdAt: order.created_at, updatedAt: order.updated_at,
    cancellationReason: order.cancellation_reason,
    ...(detail ? {
      pickupCode: ["delivered", "cancelled"].includes(order.status) ? "" : parcel.pickup_code,
      events: getOrderEvents(db, order.id).map((value) => {
        const event = value as Record<string, unknown>;
        return { id: event.id, type: event.event_type, status: event.to_status, createdAt: event.created_at };
      })
    } : {})
  };
}

export function parcelDemoRouter(db: SqliteDatabase, config: AppConfig): Router {
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!config.parcelDemoKey) throw new AppError(503, "代取演示未开启", "DEMO_DISABLED");
    const supplied = req.get("Authorization") ?? "";
    const a = createHash("sha256").update(supplied).digest();
    const b = createHash("sha256").update(`Bearer ${config.parcelDemoKey}`).digest();
    if (!timingSafeEqual(a, b)) throw new AppError(401, "服务身份验证失败", "SERVICE_UNAUTHORIZED");
    next();
  });

  router.post("/orders", (req, res) => {
    const input = inputSchema.parse(req.body);
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const result = db.transaction(() => {
      const existing = db.prepare("SELECT * FROM parcel_demo_orders WHERE source_user_id = ? AND request_id = ?").get(input.sourceUserId, input.requestId) as Parcel | undefined;
      if (existing) {
        if (existing.request_hash !== hash) throw new AppError(409, "本次提交已处理，请查看原订单或发起新订单", "IDEMPOTENCY_CONFLICT");
        return { parcel: existing, idempotent: true };
      }
      const active = db.prepare("SELECT COUNT(*) AS count FROM parcel_demo_orders p JOIN orders o ON o.id = p.order_id WHERE p.source_user_id = ? AND o.status NOT IN ('delivered', 'cancelled')").get(input.sourceUserId) as { count: number };
      if (active.count >= 5) throw new AppError(429, "演示期间最多同时保留 5 笔进行中订单", "DEMO_LIMIT");
      const tenant = resources(db);
      // Keep this demo's accounting fixed even if its rule was changed in the admin UI.
      const rule = db.prepare("SELECT * FROM pricing_rules WHERE id = ?").get(tenant.pricing_rule_id) as Record<string, unknown>;
      if (!rule.active || ["base_fee_cents", "per_km_cents", "minimum_fee_cents", "rider_share_percent"].some((key) => Number(rule[key]) !== 0)) {
        throw new AppError(409, "演示计价配置异常，请联系管理员恢复免费演示规则", "DEMO_PRICING_INVALID");
      }
      const created = createOrder(db, {
        merchantId: tenant.merchant_id, pricingRuleId: tenant.pricing_rule_id,
        pickupAddress: input.pickupAddress, deliveryAddress: input.deliveryAddress,
        recipientName: input.recipientName, recipientPhone: input.recipientPhone,
        itemsDescription: `【代取演示·不收费】${input.campusName}，${input.parcelCount} 件包裹${input.remark ? `；${input.remark}` : ""}`,
        distanceMeters: 0
      }, actor(tenant));
      db.prepare("INSERT INTO parcel_demo_orders (order_id, source_user_id, request_id, request_hash, campus_id, campus_name, pickup_code, parcel_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(created.order.id, input.sourceUserId, input.requestId, hash, input.campusId, input.campusName, input.pickupCode, input.parcelCount, nowIso());
      return { parcel: owned(db, created.order.id, input.sourceUserId), idempotent: false };
    })();
    res.status(result.idempotent ? 200 : 201).json({ order: dto(db, result.parcel, true), idempotent: result.idempotent });
  });

  router.get("/orders", (req, res) => {
    const query = z.object({ sourceUserId: sourceUser, offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const rows = db.prepare("SELECT * FROM parcel_demo_orders WHERE source_user_id = ? ORDER BY order_id DESC LIMIT ? OFFSET ?").all(query.sourceUserId, query.limit, query.offset) as Parcel[];
    res.json({ orders: rows.map((p) => dto(db, p)), hasMore: rows.length === query.limit });
  });

  router.get("/orders/:id", (req, res) => {
    const parcel = owned(db, z.coerce.number().int().positive().parse(req.params.id), sourceUser.parse(req.query.sourceUserId));
    res.json({ order: dto(db, parcel, true) });
  });

  router.post("/orders/:id/cancel", (req, res) => {
    const body = z.object({ sourceUserId: sourceUser, reason: z.string().trim().min(1).max(200) }).strict().parse(req.body);
    const parcel = owned(db, z.coerce.number().int().positive().parse(req.params.id), body.sourceUserId);
    transitionOrder(db, parcel.order_id, "cancelled", actor(resources(db)), body.reason);
    res.json({ order: dto(db, parcel, true) });
  });
  return router;
}
