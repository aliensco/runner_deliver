# Local API

The server is a local-only Express + TypeScript application backed by SQLite.
It does not contain or require credentials from the referenced production system.

## Run

1. Copy `.env.example` to `.env` and keep the demo-only password.
2. Run `npm install`.
3. Run `npm run dev` for the API and Vite client, or `npm run dev:server` for only the API.

The API listens on `http://localhost:3000` by default. `GET /api/health` is public;
all business endpoints require the same-origin `runner_session` cookie.

The optional local seed creates `demo_admin`, `demo_merchant`, and `demo_rider`.
All three use `DEMO_PASSWORD`; they are development fixtures, not production accounts.

## Core workflow

`pending -> assigned -> accepted -> picked_up -> delivered`

- Administrators manually assign or reassign an uncollected order.
- Only the currently assigned rider can accept, pick up, and deliver it.
- Administrators and the owning merchant may cancel before pickup.
- Creation debits the merchant. Pre-pickup cancellation refunds that debit once.
- Delivery credits the rider once. Ledger idempotency keys back both settlements.
- Every order mutation records an `order_events` row.
- Order creation accepts an optional `Idempotency-Key` header. Replaying the same
  normalized request returns the original order; reusing the key for different
  content returns `409`.
- Disabling a merchant or rider also disables linked users and revokes sessions.

All monetary API fields end in `Cents` and are stored as integer cents.

## Routes

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/dashboard`
- `GET|POST /api/orders`, `GET|PATCH /api/orders/:id`
- `GET /api/orders/:id/events`
- `POST /api/orders/:id/assign`, `POST /api/orders/:id/status`
- `GET|POST|PATCH /api/merchants`
- `GET|POST|PATCH /api/riders`
- `GET|POST|PATCH /api/pricing-rules`
- `GET /api/ledger`, `POST /api/ledger/adjustments`
- `GET|PATCH /api/settings`

Run `npm test` for the 14-case API integration suite.
