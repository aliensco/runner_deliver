import { Router } from "express";
import { z } from "zod";
import { requireRoles } from "../auth";
import type { SqliteDatabase } from "../db";
import { nowIso } from "../db";
import { AppError } from "../errors";

const allowedSettings = new Set([
  "site_name",
  "default_pricing_rule_id",
  "order_auto_cancel_minutes"
]);
const valueSchema = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);

function readSettings(db: SqliteDatabase): Record<string, unknown> {
  const rows = db
    .prepare("SELECT key, value_json FROM system_settings WHERE key NOT LIKE 'demo_%'")
    .all() as Array<{ key: string; value_json: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value_json)]));
}

export function settingsRouter(db: SqliteDatabase): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ settings: readSettings(db) });
  });

  router.patch("/", requireRoles("admin"), (req, res) => {
    const input = z.record(z.string(), valueSchema).parse(req.body);
    const entries = Object.entries(input);
    if (!entries.length) throw new AppError(400, "No settings to update", "EMPTY_UPDATE");
    const unsupported = entries.map(([key]) => key).filter((key) => !allowedSettings.has(key));
    if (unsupported.length) {
      throw new AppError(400, "Unsupported system setting", "SETTING_NOT_ALLOWED", unsupported);
    }

    if (input.default_pricing_rule_id !== undefined) {
      const ruleId = z.number().int().positive().parse(input.default_pricing_rule_id);
      const rule = db
        .prepare("SELECT 1 FROM pricing_rules WHERE id = ? AND active = 1")
        .get(ruleId);
      if (!rule) {
        throw new AppError(400, "Default pricing rule must be active", "INVALID_PRICING_RULE");
      }
    }
    if (input.order_auto_cancel_minutes !== undefined) {
      z.number().int().min(0).max(10080).parse(input.order_auto_cancel_minutes);
    }
    if (input.site_name !== undefined) {
      z.string().trim().min(1).max(200).parse(input.site_name);
    }

    db.transaction(() => {
      const statement = db.prepare(
        `INSERT INTO system_settings (key, value_json, updated_by_user_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_at = excluded.updated_at`
      );
      const now = nowIso();
      for (const [key, value] of entries) {
        statement.run(key, JSON.stringify(value), req.auth!.id, now);
      }
    })();
    res.json({ settings: readSettings(db) });
  });

  return router;
}
