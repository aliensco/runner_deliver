import bcrypt from "bcrypt";
import type { AppConfig } from "./config";
import type { SqliteDatabase } from "./db";
import { nowIso } from "./db";

export const demoUsernames = {
  admin: "demo_admin",
  merchant: "demo_merchant",
  rider: "demo_rider"
} as const;

export function seedDemoData(db: SqliteDatabase, config: AppConfig): void {
  const alreadySeeded = db
    .prepare("SELECT 1 FROM system_settings WHERE key = 'demo_seed_version'")
    .get();
  if (alreadySeeded) return;

  const seed = db.transaction(() => {
    const now = nowIso();
    const passwordHash = bcrypt.hashSync(config.demoPassword, config.bcryptRounds);

    const merchantResult = db
      .prepare(
        `INSERT INTO merchants
          (name, contact_name, phone, address, balance_cents, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        "演示烘焙店",
        "演示商户",
        "18800000001",
        "演示区创业路 1 号",
        1_000_000,
        now,
        now
      );
    const merchantId = Number(merchantResult.lastInsertRowid);

    const riderResult = db
      .prepare(
        `INSERT INTO riders
          (name, phone, vehicle_type, status, balance_cents, active, created_at, updated_at)
         VALUES (?, ?, 'scooter', 'available', 0, 1, ?, ?)`
      )
      .run("演示骑手", "18800000002", now, now);
    const riderId = Number(riderResult.lastInsertRowid);

    const pricingResult = db
      .prepare(
        `INSERT INTO pricing_rules
          (name, base_fee_cents, base_distance_meters, per_km_cents,
           minimum_fee_cents, rider_share_percent, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run("演示同城计价", 500, 3000, 150, 500, 80, now, now);
    const pricingRuleId = Number(pricingResult.lastInsertRowid);

    const insertUser = db.prepare(
      `INSERT INTO users
        (username, password_hash, role, display_name, merchant_id, rider_id,
         active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    );
    insertUser.run(
      demoUsernames.admin,
      passwordHash,
      "admin",
      "演示管理员",
      null,
      null,
      now,
      now
    );
    insertUser.run(
      demoUsernames.merchant,
      passwordHash,
      "merchant",
      "演示商户",
      merchantId,
      null,
      now,
      now
    );
    insertUser.run(
      demoUsernames.rider,
      passwordHash,
      "rider",
      "演示骑手",
      null,
      riderId,
      now,
      now
    );

    db.prepare(
      `INSERT INTO ledger_entries
        (account_type, merchant_id, rider_id, order_id, entry_type, amount_cents,
         idempotency_key, description, created_by_user_id, created_at)
       VALUES ('merchant', ?, NULL, NULL, 'opening_balance', ?, ?, ?, NULL, ?)`
    ).run(
      merchantId,
      1_000_000,
      `demo-opening-merchant-${merchantId}`,
      "Local demo opening balance",
      now
    );

    const insertSetting = db.prepare(
      `INSERT INTO system_settings
        (key, value_json, updated_by_user_id, updated_at)
       VALUES (?, ?, NULL, ?)`
    );
    insertSetting.run("site_name", JSON.stringify("Runner Deliver Demo"), now);
    insertSetting.run("default_pricing_rule_id", JSON.stringify(pricingRuleId), now);
    insertSetting.run("demo_seed_version", JSON.stringify(1), now);
  });

  seed();
}
