import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../auth";
import type { SqliteDatabase } from "../db";
import { AppError } from "../errors";
import {
  assertCanViewOrder,
  assignOrder,
  createOrder,
  getOrder,
  getOrderEvents,
  listOrders,
  transitionOrder,
  updateOrder,
  type Actor,
  type OrderStatus
} from "../orders";
import { orderDto } from "../serializers";

const idSchema = z.coerce.number().int().positive();
const idempotencyKeySchema = z.string().trim().min(1).max(200);
const statusSchema = z.enum([
  "pending",
  "assigned",
  "accepted",
  "picked_up",
  "delivered",
  "cancelled"
]);

const createSchema = z.object({
  merchantId: z.number().int().positive().optional(),
  pricingRuleId: z.number().int().positive().optional(),
  pickupAddress: z.string().trim().min(1).max(500),
  deliveryAddress: z.string().trim().min(1).max(500),
  recipientName: z.string().trim().min(1).max(100),
  recipientPhone: z.string().trim().min(3).max(50),
  itemsDescription: z.string().trim().max(1000).default(""),
  distanceMeters: z.number().int().nonnegative().max(1_000_000)
});

const updateSchema = z
  .object({
    pickupAddress: z.string().trim().min(1).max(500).optional(),
    deliveryAddress: z.string().trim().min(1).max(500).optional(),
    recipientName: z.string().trim().min(1).max(100).optional(),
    recipientPhone: z.string().trim().min(3).max(50).optional(),
    itemsDescription: z.string().trim().max(1000).optional()
  })
  .strict();

function actorFromRequest(req: Express.Request): Actor {
  const user = req.auth!;
  return {
    id: user.id,
    role: user.role,
    merchantId: user.merchantId,
    riderId: user.riderId
  };
}

export function ordersRouter(db: SqliteDatabase): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const query = z
      .object({
        status: statusSchema.optional(),
        merchantId: z.coerce.number().int().positive().optional(),
        riderId: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().nonnegative().default(0)
      })
      .parse(req.query);
    const result = listOrders(db, actorFromRequest(req), query);
    res.json({
      orders: result.orders.map(orderDto),
      pagination: { total: result.total, limit: query.limit, offset: query.offset }
    });
  });

  router.post("/", requireRoles("admin", "merchant"), (req, res) => {
    const input = createSchema.parse(req.body);
    const actor = actorFromRequest(req);
    const merchantId = actor.role === "merchant" ? actor.merchantId : input.merchantId;
    if (!merchantId) {
      throw new AppError(400, "merchantId is required for administrators", "MERCHANT_REQUIRED");
    }
    const idempotencyKey = idempotencyKeySchema.optional().parse(req.get("Idempotency-Key"));
    const result = createOrder(db, { ...input, merchantId }, actor, idempotencyKey);
    res.status(result.idempotent ? 200 : 201).json({
      order: orderDto(result.order),
      idempotent: result.idempotent
    });
  });

  router.get("/:id", (req, res) => {
    const order = getOrder(db, idSchema.parse(req.params.id));
    assertCanViewOrder(order, actorFromRequest(req));
    res.json({ order: orderDto(order) });
  });

  router.get("/:id/events", (req, res) => {
    const id = idSchema.parse(req.params.id);
    const order = getOrder(db, id);
    assertCanViewOrder(order, actorFromRequest(req));
    const events = getOrderEvents(db, id).map((value) => {
      const event = value as Record<string, unknown>;
      return {
        id: event.id,
        orderId: event.order_id,
        actorUserId: event.actor_user_id,
        actorName: event.actor_name,
        eventType: event.event_type,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        metadata: JSON.parse(String(event.metadata_json)),
        createdAt: event.created_at
      };
    });
    res.json({ events });
  });

  router.patch("/:id", requireRoles("admin", "merchant"), (req, res) => {
    const order = updateOrder(
      db,
      idSchema.parse(req.params.id),
      updateSchema.parse(req.body),
      actorFromRequest(req)
    );
    res.json({ order: orderDto(order) });
  });

  router.post("/:id/assign", requireRoles("admin"), (req, res) => {
    const input = z.object({ riderId: z.number().int().positive() }).parse(req.body);
    const order = assignOrder(
      db,
      idSchema.parse(req.params.id),
      input.riderId,
      actorFromRequest(req)
    );
    res.json({ order: orderDto(order) });
  });

  router.post("/:id/status", (req, res) => {
    const input = z
      .object({
        status: z.enum(["accepted", "picked_up", "delivered", "cancelled"]),
        cancellationReason: z.string().trim().min(1).max(500).optional()
      })
      .parse(req.body) as { status: OrderStatus; cancellationReason?: string };
    const result = transitionOrder(
      db,
      idSchema.parse(req.params.id),
      input.status,
      actorFromRequest(req),
      input.cancellationReason
    );
    res.json({ order: orderDto(result.order), idempotent: result.idempotent });
  });

  return router;
}
