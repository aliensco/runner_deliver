import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../auth";
import type { SqliteDatabase } from "../db";
import { nowIso } from "../db";
import { AppError } from "../errors";
import { pricingRuleDto } from "../serializers";

const idSchema = z.coerce.number().int().positive();
const fields = {
  name: z.string().trim().min(1).max(200),
  baseFeeCents: z.number().int().nonnegative().max(100_000_000),
  baseDistanceMeters: z.number().int().nonnegative().max(1_000_000),
  perKmCents: z.number().int().nonnegative().max(100_000_000),
  minimumFeeCents: z.number().int().nonnegative().max(100_000_000),
  riderSharePercent: z.number().int().min(0).max(100),
  active: z.boolean()
};
const createSchema = z.object({
  name: fields.name,
  baseFeeCents: fields.baseFeeCents,
  baseDistanceMeters: fields.baseDistanceMeters,
  perKmCents: fields.perKmCents,
  minimumFeeCents: fields.minimumFeeCents,
  riderSharePercent: fields.riderSharePercent,
  active: fields.active.default(true)
});
const updateSchema = z
  .object({
    name: fields.name.optional(),
    baseFeeCents: fields.baseFeeCents.optional(),
    baseDistanceMeters: fields.baseDistanceMeters.optional(),
    perKmCents: fields.perKmCents.optional(),
    minimumFeeCents: fields.minimumFeeCents.optional(),
    riderSharePercent: fields.riderSharePercent.optional(),
    active: fields.active.optional()
  })
  .strict();

function getRule(db: SqliteDatabase, id: number): Record<string, unknown> {
  const row = db.prepare("SELECT * FROM pricing_rules WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new AppError(404, "Pricing rule not found", "PRICING_RULE_NOT_FOUND");
  return row;
}

export function pricingRulesRouter(db: SqliteDatabase): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM pricing_rules ORDER BY id DESC").all() as Record<
      string,
      unknown
    >[];
    res.json({ pricingRules: rows.map(pricingRuleDto) });
  });

  router.post("/", requireRoles("admin"), (req, res) => {
    const input = createSchema.parse(req.body);
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO pricing_rules
          (name, base_fee_cents, base_distance_meters, per_km_cents,
           minimum_fee_cents, rider_share_percent, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.name,
        input.baseFeeCents,
        input.baseDistanceMeters,
        input.perKmCents,
        input.minimumFeeCents,
        input.riderSharePercent,
        Number(input.active),
        now,
        now
      );
    res.status(201).json({
      pricingRule: pricingRuleDto(getRule(db, Number(result.lastInsertRowid)))
    });
  });

  router.get("/:id", (req, res) => {
    res.json({ pricingRule: pricingRuleDto(getRule(db, idSchema.parse(req.params.id))) });
  });

  router.patch("/:id", requireRoles("admin"), (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = updateSchema.parse(req.body);
    const entries = Object.entries(input);
    if (!entries.length) throw new AppError(400, "No fields to update", "EMPTY_UPDATE");
    getRule(db, id);

    if (input.active === false) {
      const setting = db
        .prepare("SELECT value_json FROM system_settings WHERE key = 'default_pricing_rule_id'")
        .get() as { value_json: string } | undefined;
      if (setting && Number(JSON.parse(setting.value_json)) === id) {
        throw new AppError(
          409,
          "Choose another default pricing rule before disabling this one",
          "DEFAULT_PRICING_RULE"
        );
      }
    }
    const columns: Record<string, string> = {
      name: "name",
      baseFeeCents: "base_fee_cents",
      baseDistanceMeters: "base_distance_meters",
      perKmCents: "per_km_cents",
      minimumFeeCents: "minimum_fee_cents",
      riderSharePercent: "rider_share_percent",
      active: "active"
    };
    const assignments = entries.map(([key]) => `${columns[key]} = ?`);
    const values = entries.map(([key, value]) => (key === "active" ? Number(value) : value));
    db.prepare(
      `UPDATE pricing_rules SET ${assignments.join(", ")}, updated_at = ? WHERE id = ?`
    ).run(...values, nowIso(), id);
    res.json({ pricingRule: pricingRuleDto(getRule(db, id)) });
  });

  return router;
}
