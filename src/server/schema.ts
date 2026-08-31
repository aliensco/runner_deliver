export const schemaSql = `
CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (
    balance_cents >= 0 AND balance_cents <= 1000000000000
  ),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS riders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'scooter',
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'busy', 'offline')),
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (
    balance_cents >= 0 AND balance_cents <= 1000000000000
  ),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'merchant', 'rider')),
  display_name TEXT NOT NULL,
  merchant_id INTEGER REFERENCES merchants(id) ON DELETE RESTRICT,
  rider_id INTEGER REFERENCES riders(id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (role = 'admin' AND merchant_id IS NULL AND rider_id IS NULL) OR
    (role = 'merchant' AND merchant_id IS NOT NULL AND rider_id IS NULL) OR
    (role = 'rider' AND merchant_id IS NULL AND rider_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  base_fee_cents INTEGER NOT NULL CHECK (base_fee_cents >= 0),
  base_distance_meters INTEGER NOT NULL CHECK (base_distance_meters >= 0),
  per_km_cents INTEGER NOT NULL CHECK (per_km_cents >= 0),
  minimum_fee_cents INTEGER NOT NULL CHECK (minimum_fee_cents >= 0),
  rider_share_percent INTEGER NOT NULL CHECK (rider_share_percent BETWEEN 0 AND 100),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  rider_id INTEGER REFERENCES riders(id) ON DELETE RESTRICT,
  pricing_rule_id INTEGER NOT NULL REFERENCES pricing_rules(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigned', 'accepted', 'picked_up', 'delivered', 'cancelled')),
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  items_description TEXT NOT NULL DEFAULT '',
  distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
  merchant_charge_cents INTEGER NOT NULL CHECK (merchant_charge_cents >= 0),
  rider_payout_cents INTEGER NOT NULL CHECK (rider_payout_cents >= 0),
  cancellation_reason TEXT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at TEXT,
  accepted_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  merchant_refunded_at TEXT,
  rider_paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_idempotency_keys (
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (merchant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_type TEXT NOT NULL CHECK (account_type IN ('merchant', 'rider')),
  merchant_id INTEGER REFERENCES merchants(id) ON DELETE RESTRICT,
  rider_id INTEGER REFERENCES riders(id) ON DELETE RESTRICT,
  order_id INTEGER REFERENCES orders(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'opening_balance', 'admin_adjustment', 'order_charge',
      'order_refund', 'delivery_payout'
    )
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK (
    (account_type = 'merchant' AND merchant_id IS NOT NULL AND rider_id IS NULL) OR
    (account_type = 'rider' AND merchant_id IS NULL AND rider_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_id ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_rider_id ON orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_merchant_id ON ledger_entries(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_rider_id ON ledger_entries(rider_id);
CREATE INDEX IF NOT EXISTS idx_ledger_order_id ON ledger_entries(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_order_settlement_once
  ON ledger_entries(order_id, entry_type)
  WHERE order_id IS NOT NULL
    AND entry_type IN ('order_charge', 'order_refund', 'delivery_payout');
`;
