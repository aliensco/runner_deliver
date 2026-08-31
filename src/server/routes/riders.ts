import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../auth";
import type { SqliteDatabase } from "../db";
import { nowIso } from "../db";
import { AppError } from "../errors";
import { riderDto } from "../serializers";

const idSchema = z.coerce.number().int().positive();
const riderStatus = z.enum(["available", "busy", "offline"]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(3).max(50),
  vehicleType: z.string().trim().min(1).max(100).default("scooter")
});
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(3).max(50).optional(),
    vehicleType: z.string().trim().min(1).max(100).optional(),
    status: riderStatus.optional(),
    active: z.boolean().optional()
  })
  .strict();

function getRider(db: SqliteDatabase, id: number): Record<string, unknown> {
  const row = db.prepare("SELECT * FROM riders WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new AppError(404, "Rider not found", "RIDER_NOT_FOUND");
  return row;
}

export function ridersRouter(db: SqliteDatabase): Router {
  const router = Router();
  router.use(requireRoles("admin", "rider"));

  router.get("/", (req, res) => {
    const rows = (req.auth!.role === "admin"
      ? db.prepare("SELECT * FROM riders ORDER BY id DESC").all()
      : [getRider(db, req.auth!.riderId!)]) as Record<string, unknown>[];
    res.json({ riders: rows.map(riderDto) });
  });

  router.post("/", requireRoles("admin"), (req, res) => {
    const input = createSchema.parse(req.body);
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO riders
          (name, phone, vehicle_type, status, balance_cents, active, created_at, updated_at)
         VALUES (?, ?, ?, 'available', 0, 1, ?, ?)`
      )
      .run(input.name, input.phone, input.vehicleType, now, now);
    const rider = getRider(db, Number(result.lastInsertRowid));
    res.status(201).json({ rider: riderDto(rider) });
  });

  router.get("/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    if (req.auth!.role === "rider" && req.auth!.riderId !== id) {
      throw new AppError(403, "You cannot access this rider", "FORBIDDEN");
    }
    res.json({ rider: riderDto(getRider(db, id)) });
  });

  router.patch("/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    if (req.auth!.role === "rider" && req.auth!.riderId !== id) {
      throw new AppError(403, "You cannot update this rider", "FORBIDDEN");
    }
    const input = updateSchema.parse(req.body);
    if (req.auth!.role === "rider" && input.active !== undefined) {
      throw new AppError(403, "Riders cannot change their active flag", "FORBIDDEN");
    }
    const entries = Object.entries(input);
    if (!entries.length) throw new AppError(400, "No fields to update", "EMPTY_UPDATE");
    db.transaction(() => {
      getRider(db, id);

      if (input.active === false || input.status === "offline" || input.status === "available") {
        const activeOrders = db
          .prepare(
            `SELECT COUNT(*) AS count FROM orders
             WHERE rider_id = ? AND status IN ('assigned', 'accepted', 'picked_up')`
          )
          .get(id) as { count: number };
        if (activeOrders.count > 0) {
          throw new AppError(409, "Rider has active orders", "RIDER_HAS_ACTIVE_ORDERS");
        }
      }

      const columns: Record<string, string> = {
        name: "name",
        phone: "phone",
        vehicleType: "vehicle_type",
        status: "status",
        active: "active"
      };
      const assignments = entries.map(([key]) => `${columns[key]} = ?`);
      const values = entries.map(([key, value]) =>
        key === "active" ? Number(value) : value
      );
      const now = nowIso();
      db.prepare(
        `UPDATE riders SET ${assignments.join(", ")}, updated_at = ? WHERE id = ?`
      ).run(...values, now, id);

      if (input.active !== undefined) {
        db.prepare("UPDATE users SET active = ?, updated_at = ? WHERE rider_id = ?").run(
          Number(input.active),
          now,
          id
        );
        if (!input.active) {
          db.prepare(
            "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE rider_id = ?)"
          ).run(id);
        }
      }
    })();
    res.json({ rider: riderDto(getRider(db, id)) });
  });

  return router;
}
