# QuickSeats frontend

QuickSeats frontend foundation built with Next.js App Router, React, TypeScript,
and Tailwind CSS v4. The design system lives in `app/globals.css`; reusable
primitives are in `components/ui`.

## Development

Use Node.js 20.9 or newer:

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Available checks:

```sh
npm run typecheck
npm run lint
npm run build
```

## Design system

Global semantic colors, 4px spacing values, border radii, subtle shadows,
content width, and page gutters are CSS custom properties in `app/globals.css`.
Tailwind v4 semantic color and font utilities are mapped in its `@theme inline`
block. Playfair Display is used for editorial headings and Inter for interface
and body text, loaded with `next/font/google`.

UI primitives in `components/ui` include buttons, labeled inputs, badges,
cards, a native accessible dialog, dismissible toast notifications, and
loading/empty states. They do not connect to the backend or contain mock
booking/event records.

The homepage and `/events` discovery page load published events from the
backend. Search, city, category, date range, sort order, and pagination are
represented in the discovery URL, so links can be shared and browser history
restores the selected filters. The homepage shows up to six current listings;
the discovery page shows 12 per page. Categories are derived from the event
records currently returned by the API because the backend has no category-list
endpoint.

Event cards show only API-provided information. The current list endpoint does
not populate venue details, so cards do not invent a location; poster images
fall back to a neutral placeholder when no usable URL is provided. Cards link
to `/events/{eventId}`.

The event detail route uses the public `GET /api/events/:eventId` endpoint.
Published-event detail responses include a populated venue summary; organizer
identity is an ID only, so no organizer profile is shown. The same page reads
`GET /api/events/:eventId/seats?page={page}&limit=100`, which returns a paginated
list of seat IDs, sections, row labels, seat numbers, categories, numeric
prices, and effective `AVAILABLE`, `HELD`, or `BOOKED` status. The map renders
the API's section/row/seat ordering without inventing coordinates. At most 100
seats are shown per API page.

Seat selection is local only and limited to 10 seats, matching the backend's
seat-hold validation limit. It does not call the hold endpoint or reserve seats.
The Continue action documents that limitation and keeps the selected IDs in
the current page state for the next-phase integration point. Totals use exact
decimal summation for display. The seat-map API does not include currency or
fees, so amounts are shown without a currency symbol and no additional charges
are invented. The backend remains authoritative for availability and final
pricing.

### Real-time seat updates

The backend attaches Socket.io to the same HTTP origin as its API. Configure
`NEXT_PUBLIC_SOCKET_URL` as that origin (for local development,
`http://localhost:5000`). If omitted, the frontend derives the origin from
`NEXT_PUBLIC_API_URL` by removing its API path. Use the public backend origin;
do not include credentials, URL query parameters, or a secret in either
variable. The browser origin must also be allowed by the backend's
`SOCKET_CORS_ORIGINS`.

The frontend joins the public event room by emitting `event:join` with
`{ eventId }` and checking the acknowledgement, and emits `event:leave` on
cleanup; a disconnected socket is also removed from its rooms by Socket.io.
The backend permits anonymous socket handshakes and validates an optional JWT
from Socket.io's `auth.token` field using the same bearer token kept in
tab-scoped session storage. Tokens are not put in URL parameters. If a
provided token is expired or invalid, the app ends that session and asks the
user to sign in again.

The client listens to the backend's `seat:held`, `seat:released`,
`seat:expired`, and `seat:booked` events. Each payload carries `eventId`,
`holdId`, `seats` (with `seatId`, `status`, and `lockedUntil`), and
`occurredAt`. Payloads and status/event consistency are checked; event prices
and ownership are ignored. Updates are applied by seat ID, duplicate or older
updates are ignored, and selected seats that become held/booked are removed
from the local selection. After joining (including reconnects), the displayed
page is refreshed using the seat-map API as the authoritative source. Events
arriving during a fetch are reconciled over its response to avoid reverting a
newer status.

The backend currently declares `seat:map:updated` in its event types but does
not emit it; the frontend does not subscribe to it. No frontend or backend
changes were made to seat locking or booking.

## Backend API integration

The API client lives in `lib/api/client.ts`, with response and domain types in
`lib/api/types.ts`, consistent errors in `lib/api/errors.ts`, and verified route
wrappers in `lib/api/endpoints`. It uses the backend's existing `/api` prefix;
the base URL must include that prefix, for example:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Copy `.env.example` to `.env.local` for local work. Set
`NEXT_PUBLIC_API_URL` to the deployed backend's public HTTPS URL ending in
`/api` in the frontend's hosting configuration. Never put database, Redis,
Stripe, or JWT secrets in a `NEXT_PUBLIC_` variable. The repository does not
contain a deployed backend URL, so supply it in the deployment environment.
Set the backend's `CLIENT_ORIGIN` to the frontend's deployed origin (without
the `/api` path) so Express CORS permits browser requests.

All responses use the backend's `{ success, message, data }` envelope. HTTP,
network, malformed-response, and missing-configuration failures are represented
by `ApiError`; server errors are given a safe user-facing message. Requests
support query parameters, JSON or `FormData` bodies, headers, and `AbortSignal`.
Responses default to `no-store` so booking and seat-status reads are not served
from a frontend cache.

The feature modules mirror the routes present in the backend: auth register,
login, current-user, and logout; public event and venue listing/detail; event
management, seat generation, seat-map reads, holds, and releases; booking
checkout, user bookings, details, and status; organizer sales summaries and
queued report retrieval; and liveness/readiness checks. The Stripe webhook and
internal seat-cleanup route are server-to-server endpoints and are not exposed
through this browser client.

Authentication currently uses a bearer access JWT returned by `POST /api/auth/login`.
The authentication provider keeps it in tab-scoped `sessionStorage` so the
session survives a page refresh, and validates it with `GET /api/auth/me` on
initialization. The token is not stored in `localStorage`, sent as a cookie, or
logged; authenticated API calls attach it as a bearer token. JavaScript-accessible
storage remains exposed to same-origin script execution, so a backend-issued
Secure, HttpOnly cookie session would be stronger. The backend currently has
no refresh-token endpoint or cookie/CSRF flow to support that. Logout clears
this tab's token and calls the backend, but the backend explicitly does not
revoke stateless JWTs server-side; a copied token remains usable until expiry.
Do not treat client-side route guards as authorization—the API checks every
authenticated request and role.

Public registration creates a regular `USER` and does not issue a token. The
user must sign in separately. The backend accepts only `USER` for public
registration; `ORGANIZER` and `ADMIN` are existing backend roles but are not
assignable through the public registration form. No refresh operation is
implemented because the backend has no refresh route.

`checkBackendHealth()` calls `GET /api/health`; pass `{ readiness: true }` to
call `/api/health/ready`. Liveness reports whether the API responds. Readiness
also requires MongoDB and the configured Redis services and may return 503.
The utility distinguishes missing configuration, timeout, and unavailable
service states without exposing infrastructure diagnostics.

The existing loading and empty states are in `components/ui/states.tsx`;
`components/ui/error-state.tsx` adds an accessible retry action. Run
`npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` to validate
the frontend.
