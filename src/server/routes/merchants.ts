import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../auth";
import type { SqliteDatabase } from "../db";
import { nowIso } from "../db";
import { AppError } from "../errors";
import { merchantDto } from "../serializers";

const idSchema = z.coerce.number().int().positive();
const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(3).max(50),
  address: z.string().trim().max(500).default(""),
  openingBalanceCents: z.number().int().nonnegative().max(1_000_000_000).default(0)
});
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    contactName: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(3).max(50).optional(),
    address: z.string().trim().max(500).optional(),
    active: z.boolean().optional()
  })
  .strict();

function getMerchant(db: SqliteDatabase, id: number): Record<string, unknown> {
  const row = db.prepare("SELECT * FROM merchants WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new AppError(404, "Merchant not found", "MERCHANT_NOT_FOUND");
  return row;
}

export function merchantsRouter(db: SqliteDatabase): Router {
  const router = Router();
  router.use(requireRoles("admin", "merchant"));

  router.get("/", (req, res) => {
    const rows = (req.auth!.role === "admin"
      ? db.prepare("SELECT * FROM merchants ORDER BY id DESC").all()
      : [getMerchant(db, req.auth!.merchantId!)]) as Record<string, unknown>[];
    res.json({ merchants: rows.map(merchantDto) });
  });

  router.post("/", requireRoles("admin"), (req, res) => {
    const input = createSchema.parse(req.body);
    let merchantId = 0;
    db.transaction(() => {
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO merchants
            (name, contact_name, phone, address, balance_cents, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(
          input.name,
          input.contactName,
          input.phone,
          input.address,
          input.openingBalanceCents,
          now,
          now
        );
      merchantId = Number(result.lastInsertRowid);
      if (input.openingBalanceCents > 0) {
        db.prepare(
          `INSERT INTO ledger_entries
            (account_type, merchant_id, rider_id, order_id, entry_type, amount_cents,
             idempotency_key, description, created_by_user_id, created_at)
           VALUES ('merchant', ?, NULL, NULL, 'opening_balance', ?, ?, ?, ?, ?)`
        ).run(
          merchantId,
          input.openingBalanceCents,
          `merchant-opening:${merchantId}`,
          "Merchant opening balance",
          req.auth!.id,
          now
        );
      }
    })();
    res.status(201).json({ merchant: merchantDto(getMerchant(db, merchantId)) });
  });

  router.get("/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    if (req.auth!.role === "merchant" && req.auth!.merchantId !== id) {
      throw new AppError(403, "You cannot access this merchant", "FORBIDDEN");
    }
    res.json({ merchant: merchantDto(getMerchant(db, id)) });
  });

  router.patch("/:id", requireRoles("admin"), (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = updateSchema.parse(req.body);
    const entries = Object.entries(input);
    if (!entries.length) throw new AppError(400, "No fields to update", "EMPTY_UPDATE");
    db.transaction(() => {
      getMerchant(db, id);
      if (input.active === false) {
        const activeOrders = db
          .prepare(
            `SELECT COUNT(*) AS count FROM orders
             WHERE merchant_id = ? AND status IN ('pending', 'assigned', 'accepted', 'picked_up')`
          )
          .get(id) as { count: number };
        if (activeOrders.count > 0) {
          throw new AppError(409, "Merchant has active orders", "MERCHANT_HAS_ACTIVE_ORDERS");
        }
      }
      const columns: Record<string, string> = {
        name: "name",
        contactName: "contact_name",
        phone: "phone",
        address: "address",
        active: "active"
      };
      const assignments = entries.map(([key]) => `${columns[key]} = ?`);
      const values = entries.map(([key, value]) =>
        key === "active" ? Number(value) : value
      );
      const now = nowIso();
      db.prepare(
        `UPDATE merchants SET ${assignments.join(", ")}, updated_at = ? WHERE id = ?`
      ).run(...values, now, id);

      if (input.active !== undefined) {
        db.prepare(
          "UPDATE users SET active = ?, updated_at = ? WHERE merchant_id = ?"
        ).run(Number(input.active), now, id);
        if (!input.active) {
          db.prepare(
            "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE merchant_id = ?)"
          ).run(id);
        }
      }
    })();
    res.json({ merchant: merchantDto(getMerchant(db, id)) });
  });

  return router;
}
