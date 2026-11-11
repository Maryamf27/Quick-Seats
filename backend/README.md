# QuickSeats backend

QuickSeats is a TypeScript/Express ticket-booking API using MongoDB, Redis,
Socket.IO, Stripe, and BullMQ. The API and background worker are separate
processes; `src/` contains their shared application services and models.

## Local setup

Use Node.js 22 or newer and a MongoDB replica set (MongoDB Atlas is suitable
for development). Seat holds, checkout state changes, booking confirmation,
and expiration use MongoDB transactions.

```powershell
npm ci
Copy-Item .env.example .env
```

Replace the placeholder values in `.env` with local/test credentials. Do not
commit `.env`. Run the API and worker in separate terminals:

```sh
npm run dev
npm run dev:worker
```

The worker requires a Redis service compatible with BullMQ. For local cache
and rate-limit testing, use a Redis URL with `REDIS_URL`. Set
`BULLMQ_REDIS_URL` to a separate compatible Redis service/database if your
cache provider does not support BullMQ's blocking commands. See
[.env.example](./.env.example) for the actual environment variable names and
safe placeholders.

## Architecture

```text
src/
  config/       environment, MongoDB, Redis, Stripe
  controllers/  HTTP request handlers
  jobs/         BullMQ queue and processor setup
  middlewares/  authentication, authorization, errors, rate limits
  models/       Mongoose documents and indexes
  routes/       Express API routes
  services/     booking, event, cache, payment, and report logic
  sockets/      Socket.IO auth, rooms, and event handlers
  validators/   Zod request schemas
  workers/      standalone worker process
test/           unit and opt-in integration tests
load/           k6 performance scripts
```

## MongoDB

Set `MONGODB_URI` to a MongoDB deployment with replica-set transactions
enabled. Atlas clusters support transactions; configure network access and a
database user with the application’s required read/write permissions. Never
use a production database for tests.

## Redis setup

The backend uses the official `redis` (node-redis) client. Set `REDIS_URL` to
the Redis URL shown by Upstash, for example a `rediss://` URL. Copy
`.env.example` to `.env` and replace all sample values with your own local or
deployment configuration. Never commit `.env` or paste real credentials into
`.env.example`.

Redis caching is an optional optimization in local development: when Redis is
temporarily unavailable, public reads fall back to MongoDB. Production
requires `REDIS_URL` because authenticated and booking-sensitive rate limits
fail closed when Redis is unavailable. The API starts without waiting
indefinitely; node-redis reconnects in the background. Redis errors are logged
without logging connection URLs.

## Cache behavior

Public event listings, published event details, and venue details use
cache-aside. A cache miss loads MongoDB and stores only successful, non-empty
results. Draft event details and seat maps are not cached. Single-flight
deduplicates concurrent misses for the same key within one backend process.

Cache keys are namespaced:

- `quickseats:event:{eventId}` — published event detail
- `quickseats:venue:{venueId}` — venue detail
- `quickseats:events:{version}:{queryHash}` — public event listing, with a
  SHA-256 hash of normalized query parameters
- `quickseats:events:version` — listing generation, incremented after event
  or venue writes

Default TTLs are configurable in seconds:

- `CACHE_EVENT_TTL_SECONDS` (60)
- `CACHE_EVENT_LIST_TTL_SECONDS` (30)
- `CACHE_VENUE_TTL_SECONDS` (300)

Successful event writes delete the matching event detail and advance the
listing generation. Venue updates delete the venue detail, advance the listing
generation, and delete related event details. Failed MongoDB writes do not
invalidate cache entries. If Redis is unavailable during invalidation, the
write still succeeds and existing entries expire by their bounded TTL; the
invalidation failure is logged.

Seat status, seat holds, bookings, and payment confirmation remain backed by
MongoDB and the existing Phase 4–6 logic. Redis is never authoritative for
booking or availability. Cache hit, miss, error, write, and invalidation
counters are periodically logged and logged again at shutdown.

## Tests

Run the TypeScript checks, lint, tests, and production compilation from this
directory:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The cache unit tests use an in-memory Redis-compatible backend. The existing
Socket.IO/booking, seat concurrency, and BullMQ startup integration tests are
run only when explicitly opted in and configured with isolated infrastructure:

- Set `RUN_INTEGRATION_TESTS=1`.
- `MONGODB_TEST_URI` must use a separate database whose name contains `test`,
  `testing`, or `ci`, hosted on a transaction-capable MongoDB replica set.
- `REDIS_TEST_URL` must point to a local/isolated Redis test service. The test
  setup will not connect to a remote Redis host.

For example, in PowerShell set those variables to your isolated test services,
then run:

```powershell
$env:RUN_INTEGRATION_TESTS = "1"
$env:MONGODB_TEST_URI = "mongodb://127.0.0.1:27017/quickseats-test?replicaSet=rs0"
$env:REDIS_TEST_URL = "redis://127.0.0.1:6379/0"
$env:BULLMQ_REDIS_TEST_URL = "redis://127.0.0.1:6379/1"
npm run test:integration
```

The test-infrastructure guard skips tests rather than risking a production
database or remote Redis service. Never point test variables at production.

## Rate limiting and flash-sale protection

Rate-limit counters use the existing shared node-redis connection and an
atomic Redis Lua script (`INCR` plus first-hit `PEXPIRE`) with fixed windows.
Instances sharing the Redis URL share counters. User/account/IP identifiers
are hashed before being included in keys. IP addresses come from Express
`request.ip`; forwarded headers are only trusted through the configured
`TRUST_PROXY_HOPS` setting. Set it to `1` when deployed behind Render's single
trusted proxy, and leave it at `0` for direct local development. Do not trust
arbitrary forwarded headers.

| Route category | Default policy |
| --- | --- |
| General `/api` requests | 300 per IP per 60 seconds |
| Register/login | 20 per IP and 8 per normalized account per 15 minutes |
| Public event list/detail/seat-map reads | 120 per IP per 60 seconds; event-specific read burst ceiling 10,000 per event per 60 seconds |
| Seat holds | 8 per authenticated user and per user/event, plus 40 per IP/event per 60 seconds |
| Checkout | 5 per authenticated user and 30 per IP per 60 seconds |

These are fixed-window limits, suitable for baseline burst control without
introducing a queue. The event read bucket gives popular events a separate
ceiling; seat holds use tighter per-user/per-event and IP/event buckets.
MongoDB's existing seat checks and atomic hold logic remain authoritative.
Checkout ownership and Stripe idempotency are unchanged. Booking status reads
are not subject to checkout-specific limits. Stripe webhooks are mounted
outside the user-facing global limiter so Stripe retries reach signature
verification and idempotent processing.

All limits and windows can be tuned through the `RATE_LIMIT_*`,
`AUTH_RATE_LIMIT_*`, `SEAT_HOLD_RATE_LIMIT_*`, `CHECKOUT_RATE_LIMIT_*`, and
`EVENT_*RATE_LIMIT_*` variables in `.env.example`. Tune them using observed
traffic and the emitted `QuickSeats rate-limit metrics` logs.

If Redis is unavailable, the global and public-read limits log the error and
fail open to preserve browsing availability. Authentication, seat holds, and
checkout fail closed with HTTP 503 and `Retry-After: 5`; this is distinct from
HTTP 429 quota exhaustion. Redis credentials and account identifiers are not
included in logs or responses. Cache behavior continues to use its separate
Phase 7 error handling. Health checks and Stripe webhooks are excluded from
the global limiter.

Rate-limit tests run as part of `npm test`; run `npm run typecheck` to verify
TypeScript.

## Background jobs

The HTTP API and background worker are separate processes. Jobs use BullMQ
with a dedicated `BULLMQ_REDIS_URL` and ioredis connection, separate from the
Phase 7/8 node-redis cache/rate-limit connection. BullMQ workers require a
Redis-compatible TCP service that supports Lua scripts, blocking commands,
and duplicated connections. Do not assume the Upstash endpoint used for
cache/rate limits satisfies those requirements; configure and verify a
compatible Redis deployment for `BULLMQ_REDIS_URL`. The example points to a
local Redis server. The worker refuses to start without this URL.

Run the API and worker in separate terminals from this directory:

```sh
npm run dev
npm run dev:worker
```

For compiled processes, run `npm run build`, then `npm start` for the API and
`npm run worker` for the worker. Both processes need `MONGODB_URI` and the same `BULLMQ_REDIS_URL`; the worker
and API use that compatible Redis endpoint for cross-process seat socket
notifications (it is preferred over `REDIS_URL` for this channel). The socket notification subscriber in the API emits worker
notifications to existing event rooms after the worker's MongoDB transaction
commits.

The maintenance queue installs stable recurring schedulers for expired seat
holds, pending unpaid bookings, and existing refund retries. Intervals use
`SEAT_CLEANUP_INTERVAL_SECONDS`, `BOOKING_CLEANUP_INTERVAL_SECONDS`, and
`SEAT_NOTIFICATION_OUTBOX_INTERVAL_SECONDS`.
Pending report records are re-enqueued periodically by deterministic job ID,
covering a process crash between the MongoDB report insert and Redis enqueue.
BullMQ applies `BACKGROUND_JOB_ATTEMPTS` attempts and exponential backoff from
`BACKGROUND_JOB_BACKOFF_MS`; completed jobs and old failed jobs are retained
for bounded periods. Multiple worker processes share the scheduler IDs and
BullMQ locks. Maintenance processors reuse the existing seat-expiration and
refund services. Pending booking expiration rechecks `PENDING` + `UNPAID`
state inside a MongoDB transaction and releases only seats matching the
booking's exact event, seat IDs, hold ID, user, and HELD status. It never sets
payment status to failed; late Stripe events remain handled by the existing
webhook path.

Organizer reports are available to authenticated organizers at:

- `GET /api/organizer/reports/summary?from=...&to=...` for a 30-day default
  summary (maximum range 366 days).
- `POST /api/organizer/reports` with optional `{ "from": "...", "to": "..." }`
  to queue a report; response includes a report ID and `PENDING` status.
- `GET /api/organizer/reports/:reportId` to poll status and read a completed
  result.

Reports are stored in MongoDB and scoped to the authenticated organizer.
Revenue is reported separately by currency and counts only CONFIRMED, PAID
bookings whose `paidAt` falls in the requested range. Report workers use
`REPORT_JOB_CONCURRENCY`; `REPORT_RECOVERY_INTERVAL_SECONDS` controls pending
report recovery. Jobs retry with the shared BullMQ retry policy and
persist a generic failure status after retries are exhausted.

Background-job tests are part of `npm test`; MongoDB transaction tests require
an isolated, transaction-capable `MONGODB_TEST_URI`. Use a separate test
database and never point cleanup tests at production data.

## Health and readiness

- `GET /api/health` is a liveness check and does not depend on MongoDB or Redis.
- `GET /api/health/ready` returns HTTP 200 only when MongoDB and the configured
  Redis services are ready; it returns HTTP 503 otherwise. The response
  contains dependency states only, never connection strings or credentials.
  Production requires `REDIS_URL` and `BULLMQ_REDIS_URL`.

## Load testing

The k6 script exercises public event listings and, when `EVENT_ID` is
supplied, event details and seat maps. Optional environment variables enable
login, seat holds, and checkout. It reports throughput, error rates, and
average, p90, p95, and p99 request latency; expected HTTP 429 responses are
identified as rate-limit observations.

```sh
BASE_URL=http://127.0.0.1:5000 EVENT_ID=YOUR_PUBLISHED_EVENT_ID TARGET_VUS=10 DURATION=30s npm run test:load
```

For PowerShell, set `$env:BASE_URL`, `$env:EVENT_ID`, `$env:TARGET_VUS`, and
`$env:DURATION` before running the script. Authentication requests require
`LOGIN_EMAIL` and `LOGIN_PASSWORD`. Seat holds require `ACCESS_TOKEN` (or
those login values) and comma-separated `SEAT_IDS`. Checkout is disabled
unless `ENABLE_CHECKOUT=true`; enabling it creates real pending bookings and
Stripe Test-mode Checkout Sessions, so use only a disposable test database and
test credentials. Never enable write-load against production.

Install k6 separately before running `npm run test:load`. Run it only against
a non-production environment. This repository does not include executed load
test measurements or database/cache/queue latency instrumentation; do not
infer capacity or user limits from the script.

## Continuous integration

`../.github/workflows/ci.yml` runs `npm ci`, TypeScript checks, ESLint, tests, and
the production build on pull requests and pushes to `main`. It provisions
ephemeral MongoDB replica-set and Redis services and uses dummy test-only
Stripe/JWT values; it does not require production secrets or deploy
automatically.

## Render deployment

The repository-root [`render.yaml`](../render.yaml) defines two independently deployed
services, both rooted at `backend`:

- `quickseats-api`: build with `npm ci && npm run build`, start with
  `npm start`, readiness path `/api/health/ready`.
- `quickseats-worker`: build with `npm ci && npm run build`, start with
  `npm run worker`; this process does not expose an HTTP port.

Before creating services, configure the `quickseats-production` environment
group in Render with production `MONGODB_URI`, `REDIS_URL`,
`BULLMQ_REDIS_URL`, `CLIENT_ORIGIN`, `SOCKET_CORS_ORIGINS`,
`JWT_ACCESS_SECRET`, `INTERNAL_CLEANUP_SECRET`, initial admin credentials,
Stripe credentials, checkout URLs, and the trusted proxy hop count. Use a transaction-capable MongoDB
deployment and a Redis endpoint verified to support BullMQ. The worker needs
an always-on plan; review provider pricing and networking before deployment.
Automatic deploys are disabled in the Blueprint; deploy only after CI passes.
No Render service has been deployed or verified from this repository state.

### Stripe webhook

Configure Stripe Test mode with the deployed URL
`https://YOUR-RENDER-SERVICE.onrender.com/api/payments/webhook` and set
`STRIPE_WEBHOOK_SECRET` to the signing secret for that deployed endpoint. Do
not use the local Stripe CLI forwarding secret on Render. The payment router
is mounted before JSON parsing to preserve the raw request body; the backend
verifies Stripe signatures and uses the MongoDB payment-event record for
idempotency. Validate the full workflow in Stripe Test mode before enabling
live payments. This repository has not connected to Stripe Test mode or a
deployed webhook.

## Phase 10 audit and current test limits

| Area | Audit result |
| --- | --- |
| Authentication and role checks | JWT/password flows exist; event ownership and venue mutation checks were tightened in this phase. |
| Public event data | Published event and seat-map checks now exclude draft events; socket joins are limited to published events. |
| MongoDB booking correctness | Seat holds and webhook state changes use MongoDB transactions; integration coverage is conditional on isolated replica-set infrastructure. |
| Stripe | Checkout/webhook/refund boundaries are implemented and covered by mocked integration tests; a live Stripe Test-mode run remains unverified. |
| Redis/cache/rate limits | Implemented with fallback/fail-closed policies; CI tests use a local isolated Redis service. |
| Background jobs/reports | BullMQ worker startup and recurring scheduler registration are integration-tested when isolated Redis is supplied; full long-running retry/failure recovery is not stress-tested. |
| Performance | A safe, read-only k6 script is provided; no load test has been executed and no capacity claim is made. |
| CI | Workflow is configured but has not yet run on GitHub. |
| Render | Blueprint is configured, but deployment, MongoDB/Redis connectivity, and webhook delivery require manual setup and remain unverified. |

Security findings fixed here: cross-organizer event writes/seat generation,
public venue writes (venue mutations are now admin-only because venues have no
owner field), and access to draft event details/seat maps/socket rooms.
Production startup now rejects missing shared Redis and known placeholder
secrets. Full external-service verification still requires a deployed
transaction-capable MongoDB, compatible Redis, Stripe Test mode, and Render
access.
