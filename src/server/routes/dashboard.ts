import { Router } from "express";
import type { SqliteDatabase } from "../db";

function statusCounts(
  db: SqliteDatabase,
  whereSql = "",
  params: Array<string | number> = []
): Record<string, number> {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS count FROM orders ${whereSql} GROUP BY status`)
    .all(...params) as Array<{ status: string; count: number }>;
  const result: Record<string, number> = {
    pending: 0,
    assigned: 0,
    accepted: 0,
    picked_up: 0,
    delivered: 0,
    cancelled: 0
  };
  for (const row of rows) result[row.status] = row.count;
  return result;
}

export function dashboardRouter(db: SqliteDatabase): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const user = req.auth!;
    if (user.role === "admin") {
      const merchants = db
        .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(balance_cents), 0) AS balance FROM merchants WHERE active = 1")
        .get() as { count: number; balance: number };
      const riders = db
        .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(balance_cents), 0) AS balance FROM riders WHERE active = 1")
        .get() as { count: number; balance: number };
      const revenue = db
        .prepare(
          `SELECT COALESCE(SUM(merchant_charge_cents), 0) AS charged,
                  COALESCE(SUM(CASE WHEN status = 'delivered' THEN merchant_charge_cents ELSE 0 END), 0) AS delivered_value,
                  COALESCE(SUM(CASE WHEN status = 'delivered' THEN rider_payout_cents ELSE 0 END), 0) AS rider_payouts
           FROM orders`
        )
        .get() as { charged: number; delivered_value: number; rider_payouts: number };
      res.json({
        role: user.role,
        orderCounts: statusCounts(db),
        merchants: { activeCount: merchants.count, totalBalanceCents: merchants.balance },
        riders: { activeCount: riders.count, totalBalanceCents: riders.balance },
        financials: {
          orderChargesCents: revenue.charged,
          deliveredOrderValueCents: revenue.delivered_value,
          riderPayoutsCents: revenue.rider_payouts
        }
      });
      return;
    }

    if (user.role === "merchant") {
      const merchant = db
        .prepare("SELECT balance_cents FROM merchants WHERE id = ?")
        .get(user.merchantId) as { balance_cents: number };
      const ledger = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN entry_type = 'order_charge' THEN -amount_cents ELSE 0 END), 0) AS charges,
             COALESCE(SUM(CASE WHEN entry_type = 'order_refund' THEN amount_cents ELSE 0 END), 0) AS refunds
           FROM ledger_entries WHERE merchant_id = ?`
        )
        .get(user.merchantId) as { charges: number; refunds: number };
      res.json({
        role: user.role,
        balanceCents: merchant.balance_cents,
        orderCounts: statusCounts(db, "WHERE merchant_id = ?", [user.merchantId!]),
        financials: { chargesCents: ledger.charges, refundsCents: ledger.refunds }
      });
      return;
    }

    const rider = db
      .prepare("SELECT balance_cents, status FROM riders WHERE id = ?")
      .get(user.riderId) as { balance_cents: number; status: string };
    const payouts = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total
         FROM ledger_entries WHERE rider_id = ? AND entry_type = 'delivery_payout'`
      )
      .get(user.riderId) as { total: number };
    res.json({
      role: user.role,
      riderStatus: rider.status,
      balanceCents: rider.balance_cents,
      payoutTotalCents: payouts.total,
      orderCounts: statusCounts(db, "WHERE rider_id = ?", [user.riderId!])
    });
  });

  return router;
}
