# QuickSeats

QuickSeats is a full-stack ticket-booking platform. Customers browse events, pick
seats on a live seat map, hold them for a few minutes and pay with Stripe.
Organizers publish events and track sales; administrators run the platform.

| Part | Stack | Folder |
| --- | --- | --- |
| Web app | Next.js (App Router), React, TypeScript | [`frontend/`](./frontend) |
| API | Express 5, TypeScript, MongoDB (Mongoose), Redis, Socket.IO, Stripe | [`backend/`](./backend) |
| Background worker | BullMQ on Redis (same codebase as the API, separate process) | `backend/src/workers` |

## Architecture

```text
 Browser (Next.js) ──HTTPS──▶ API (Express) ──▶ MongoDB (replica set, transactions)
        │  ▲                     │  ▲ │
        │  └── Socket.IO ◀───────┘  │ └──▶ Redis (cache, rate limits)
        │      live seat updates    │
        └──▶ Stripe Checkout ───────┘ webhook (idempotent, PaymentEvent)

 Worker (BullMQ) ──▶ MongoDB   expire holds/bookings, retry refunds,
                    Redis      recover reports, email weekly sales summaries
```

### Roles

- **Customer (`USER`)** – register/login, browse events, hold seats, pay, view and
  cancel bookings, edit profile and change password.
- **Organizer (`ORGANIZER`)** – created when an admin approves an organizer
  application. Creates and edits events, generates seats, sees bookings,
  analytics and sales reports, and receives a weekly sales-summary email.
- **Admin (`ADMIN`)** – reviews organizer applications, manages users (role,
  suspension), venues, events (unpublish / cancel with refunds), bookings, and
  sees platform analytics.

### How double-booking is prevented

A seat can only move `AVAILABLE → HELD → BOOKED`. Holding seats is a single
conditional `updateMany` inside a MongoDB transaction: it claims only seats that are
`AVAILABLE` (or whose previous hold has expired). If fewer seats were claimed than
requested, the transaction aborts, so a hold is all-or-nothing and two concurrent
requests can never both win the same seat. There is deliberately no
"read availability, then write" step. Stripe webhooks are idempotent (each Stripe
event id is stored once), and a payment that arrives after its hold expired is
refunded automatically.

### Why seat holds do not use a MongoDB TTL index

A TTL index deletes whole documents when they expire. Seats are permanent inventory
(`AVAILABLE`/`HELD`/`BOOKED` for the life of the event), so a TTL index on `Seat`
would delete the seat itself rather than release the hold. Using one would need a
separate `holds` collection holding a TTL-indexed document per hold, kept in sync
with the seats. QuickSeats instead stores `lockedUntil`/`holdId` on the seat and
expires holds two ways:

1. **Lazily and exactly:** `holdSeats` treats `HELD` seats whose `lockedUntil` has
   passed as claimable, and the seat map reports them as available, so correctness
   never depends on a background job running on time.
2. **Actively:** a recurring BullMQ job returns expired holds to `AVAILABLE` and
   pushes a `seat:expired` Socket.IO event so other users' seat maps update live.
   MongoDB's own TTL monitor only runs about once a minute and cannot emit those
   events, which is the other reason a TTL index was not used.

### Booking cancellation and refunds

`POST /api/bookings/:id/cancel` cancels a confirmed, paid booking up to
`BOOKING_CANCELLATION_CUTOFF_HOURS` (default 24) before the event starts. In one
transaction the booking becomes `CANCELLED` with a pending refund and its seats go back
to `AVAILABLE`. The Stripe refund is attempted immediately after commit; if Stripe is
unavailable the existing refund-retry job completes it, so a customer is never left
cancelled-but-unrefunded. Cancelling an event as an admin does the same for every
confirmed booking on the event.

## Getting started

Prerequisites: Node.js 22+, a MongoDB replica set (Atlas works), a Redis server and a
Stripe account in Test mode.

```sh
# API + worker
cd backend
cp .env.example .env        # fill in the placeholders
npm ci
npm run seed:admin          # creates the initial admin from INITIAL_ADMIN_*
npm run dev                 # terminal 1: API on :5000
npm run dev:worker          # terminal 2: background worker

# Web app
cd ../frontend
cp .env.example .env.local
npm ci
npm run dev                 # http://localhost:3000
```

To receive Stripe webhooks locally run
`stripe listen --forward-to localhost:5000/api/payments/webhook` and copy the printed
signing secret into `STRIPE_WEBHOOK_SECRET`.

More detail: [backend README](./backend/README.md) · [frontend README](./frontend/README.md).

## Testing and CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`:

- **backend** – typecheck, lint, unit tests, integration tests (against ephemeral
  MongoDB replica-set and Redis services) and the production build.
- **frontend** – Next route-type generation, typecheck, lint, unit tests and the
  production build.

Run the same checks locally with `npm run typecheck`, `npm run lint`, `npm test` and
`npm run build` inside each folder (`npm run test:integration` in `backend/` needs
MongoDB and Redis and the `*_TEST_*` variables from the workflow).

## Deployment

| Piece | Where | Notes |
| --- | --- | --- |
| API | Railway service rooted at `backend/` | build `npm ci && npm run build`, start `npm start`, health check `/api/health/ready` |
| Worker | Second Railway service rooted at `backend/` | start `npm run worker`; needs the same `MONGODB_URI` and `BULLMQ_REDIS_URL` |
| Web app | Any Next.js host, e.g. Vercel with root directory `frontend/` | set `NEXT_PUBLIC_API_URL` (and optionally `NEXT_PUBLIC_SOCKET_URL`) to the public API; production requires HTTPS |
| Stripe | Dashboard webhook → `https://<api-host>/api/payments/webhook` | events: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded` |

Set `CLIENT_ORIGIN` on the API to the deployed web origin. The weekly sales-summary
email needs `SMTP_URL` on the **worker**; without it the worker only logs the send.
The deployment above is a description of how the project is configured to run, not a
record of a live environment: verify service health and webhook delivery after each
deploy.
