import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../auth";
import type { SqliteDatabase } from "../db";
import { nowIso } from "../db";
import { AppError } from "../errors";
import { ledgerDto } from "../serializers";

const maxAdjustmentCents = 10_000_000_000;
const maxAccountBalanceCents = 1_000_000_000_000;
const adjustmentKeyPrefix = "admin-adjustment:";
const reservedKeyPrefixes = [
  "order-charge:",
  "order-refund:",
  "delivery-payout:",
  adjustmentKeyPrefix
];

const adjustmentSchema = z.object({
  accountType: z.enum(["merchant", "rider"]),
  accountId: z.number().int().positive(),
  amountCents: z
    .number()
    .int()
    .min(-maxAdjustmentCents)
    .max(maxAdjustmentCents)
    .refine((value) => value !== 0, "amountCents cannot be zero"),
  description: z.string().trim().min(1).max(500),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(200)
    .refine(
      (value) => !reservedKeyPrefixes.some((prefix) => value.startsWith(prefix)),
      "idempotencyKey uses a reserved server namespace"
    )
});

export function ledgerRouter(db: SqliteDatabase): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const query = z
      .object({
        orderId: z.coerce.number().int().positive().optional(),
        entryType: z
          .enum([
            "opening_balance",
            "admin_adjustment",
            "order_charge",
            "order_refund",
            "delivery_payout"
          ])
          .optional(),
        accountType: z.enum(["merchant", "rider"]).optional(),
        accountId: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().nonnegative().default(0)
      })
      .parse(req.query);
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (req.auth!.role === "merchant") {
      where.push("merchant_id = ?");
      params.push(req.auth!.merchantId!);
    } else if (req.auth!.role === "rider") {
      where.push("rider_id = ?");
      params.push(req.auth!.riderId!);
    } else if (query.accountType && query.accountId) {
      where.push(query.accountType === "merchant" ? "merchant_id = ?" : "rider_id = ?");
      params.push(query.accountId);
    }
    if (query.orderId) {
      where.push("order_id = ?");
      params.push(query.orderId);
    }
    if (query.entryType) {
      where.push("entry_type = ?");
      params.push(query.entryType);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT * FROM ledger_entries${whereSql}
         ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(...params, query.limit, query.offset) as Record<string, unknown>[];
    const total = (
      db.prepare(`SELECT COUNT(*) AS count FROM ledger_entries${whereSql}`).get(...params) as {
        count: number;
      }
    ).count;
    res.json({
      entries: rows.map(ledgerDto),
      pagination: { total, limit: query.limit, offset: query.offset }
    });
  });

  router.post("/adjustments", requireRoles("admin"), (req, res) => {
    const input = adjustmentSchema.parse(req.body);
    const storedIdempotencyKey = `${adjustmentKeyPrefix}${input.idempotencyKey}`;
    let idempotent = false;
    let entryId = 0;
    db.transaction(() => {
      const existing = db
        .prepare(
          `SELECT * FROM ledger_entries
           WHERE idempotency_key = ?
              OR (idempotency_key = ? AND entry_type = 'admin_adjustment')
           ORDER BY CASE WHEN idempotency_key = ? THEN 0 ELSE 1 END
           LIMIT 1`
        )
        .get(storedIdempotencyKey, input.idempotencyKey, storedIdempotencyKey) as
        | Record<string, unknown>
        | undefined;
      if (existing) {
        const expectedAccountId =
          input.accountType === "merchant" ? existing.merchant_id : existing.rider_id;
        if (
          existing.entry_type !== "admin_adjustment" ||
          existing.account_type !== input.accountType ||
          Number(expectedAccountId) !== input.accountId ||
          Number(existing.amount_cents) !== input.amountCents ||
          existing.description !== input.description
        ) {
          throw new AppError(
            409,
            "Idempotency key was already used with different adjustment data",
            "IDEMPOTENCY_CONFLICT"
          );
        }
        idempotent = true;
        entryId = Number(existing.id);
        return;
      }

      const table = input.accountType === "merchant" ? "merchants" : "riders";
      const account = db
        .prepare(`SELECT id, balance_cents FROM ${table} WHERE id = ?`)
        .get(input.accountId) as { id: number; balance_cents: number } | undefined;
      if (!account) throw new AppError(404, "Ledger account not found", "ACCOUNT_NOT_FOUND");
      const nextBalance = account.balance_cents + input.amountCents;
      if (!Number.isSafeInteger(account.balance_cents) || !Number.isSafeInteger(nextBalance)) {
        throw new AppError(409, "Account balance is outside the safe integer range", "UNSAFE_BALANCE");
      }
      if (nextBalance < 0) {
        throw new AppError(409, "Adjustment would make balance negative", "INSUFFICIENT_BALANCE");
      }
      if (nextBalance > maxAccountBalanceCents) {
        throw new AppError(409, "Adjustment would exceed the account balance limit", "BALANCE_LIMIT");
      }

      const now = nowIso();
      db.prepare(`UPDATE ${table} SET balance_cents = balance_cents + ?, updated_at = ? WHERE id = ?`).run(
        input.amountCents,
        now,
        input.accountId
      );
      const merchantId = input.accountType === "merchant" ? input.accountId : null;
      const riderId = input.accountType === "rider" ? input.accountId : null;
      const result = db
        .prepare(
          `INSERT INTO ledger_entries
            (account_type, merchant_id, rider_id, order_id, entry_type, amount_cents,
             idempotency_key, description, created_by_user_id, created_at)
           VALUES (?, ?, ?, NULL, 'admin_adjustment', ?, ?, ?, ?, ?)`
        )
        .run(
          input.accountType,
          merchantId,
          riderId,
          input.amountCents,
          storedIdempotencyKey,
          input.description,
          req.auth!.id,
          now
        );
      entryId = Number(result.lastInsertRowid);
    })();

    const entry = db.prepare("SELECT * FROM ledger_entries WHERE id = ?").get(entryId) as Record<
      string,
      unknown
    >;
    res.status(idempotent ? 200 : 201).json({ entry: ledgerDto(entry), idempotent });
  });

  return router;
}
