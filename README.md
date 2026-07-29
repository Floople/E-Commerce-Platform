# E-Commerce Platform

A small e-commerce backend (TypeScript + Express) that handles product purchases, refunds, and
customer credit balances, backed by an external API that provides Customer, Shipment, and Product data.

## The assignment

This project implements a take-home spec with the following requirements:

- Design and implement a simple e-commerce server exposing:
  - Grant/deduct credit balance
  - Get a customer's credit balance
  - Purchase a product (calling `CreateShipment` as part of the flow — if shipment creation
    fails, the purchase must not be saved and credit must not be deducted)
  - List product purchases
  - Refund a purchase (fully or partially)
- Design the data model for purchases and credit (and anything else needed), managed end-to-end.
- Customers and products are owned by other teams and only reachable via an API
- Auditability, a ledger to see a history of purchases and changes in credit.
- Promo codes, the ability to enter a code and receive either a **PERCENT** or **FIXED** discount on a purchase.

## Architecture

There are two apps, one for the main e-commerce server and another for the external API

- **E-commerce server** ([src/server.ts](src/server.ts)) — E-commerce API
  that retains all credit and handles all purchases.
- **Mock external API** ([src/externalApi/mockServer.ts](src/externalApi/mockServer.ts)) —
  Mock API that provides Customer, Shipment, and Product data.

```
src/
  index.ts               boots both servers
  server.ts              internal app: routing + centralized error handling
  routes/                Express routers (HTTP layer only — parsing req, calling services)
  services/              business logic (creating entries for credit and purchases, getting credit and purchase values)
  repository/            in-memory "persistence" layer
  externalApi/           mock client and server to emulate external API
  utils/                 small shared helpers (response envelope, per-key mutex)
  e2e/                   end-to-end tests against a real running server instance
```

## Data model

- **Purchase** ([src/types.ts](src/types.ts)) — one row per purchase, with an embedded array of
  `RefundRecord` and a `refundedAmount` running total, rather than maintaining another repository. A
   purchase only gets refunded a handful of times at most, so nesting the refunds keeps that data
  close at hand without needing a join. Purchase status
  (`COMPLETED` / `PARTIALLY_REFUNDED` / `REFUNDED`) is derived and stored on write.
- **CreditLedgerEntry** — every credit change (manual grant, deduction, purchase, or refund) appends
  an immutable ledger entry with `amount`, `balanceAfter`, `reason`, and, when relevant,
  `relatedPurchaseId`. The current balance is also tracked directly for instant reads. Like Purchases,
  this ledger is to ensure we have a record of what happens and why when a credit balance changes.
- **PromoCode** — hardcoded in-memory table (`SAVE10`, `SAVE20` w/ expiry, `5OFF` fixed amount),
  supporting either percent or fixed-amount discounts.

## Key design decisions

- **Per-customer locking.** Purchases, refunds, and credit grants/deductions all happen under a
  per-customer mutex ([src/utils/mutex.ts](src/utils/mutex.ts)) so a race condition can't occur
  when doing these actions. The lock is keyed by `customerId`, so customer A buying something and
  customer B adding credit can happen at the same time without blocking each other.
- **Shipment-first-failure semantics.** If `CreateShipment` fails, nothing is
  persisted and credit isn't touched. The purchase flow validates everything it can up front
  (quantity, promo code, customer/product existence, balance), *then* calls `CreateShipment`
  inside the lock, and only saves the purchase / deducts credit if that succeeds.
- **Response envelope.** Every response is either `{ data: T }` or `{ error: string }`
  ([src/utils/apiResponse.ts](src/utils/apiResponse.ts)) so clients always know where to look.
  Included so future metadata, i.e. pagination, performance, etc., can be included.
- **Error hierarchy → HTTP status mapping.** Domain errors are plain `Error` subclasses
  (`PurchaseError`, `InvalidPromoCodeError`, `PurchaseNotFoundError`, `CreditError`,
  `InsufficientCreditError`) thrown from services, caught by route handlers, and mapped to HTTP
  status codes in one place — the centralized error-handling middleware in
  [src/server.ts](src/server.ts). This keeps status-code decisions out of the route handlers.
  `ExternalApiError` (thrown by the external API client, carrying the upstream status code) is
  mapped the same way — a `404` from the external API (unknown customer/product) becomes a `404`
  from this API too, anything else upstream maps to a `502`.
- **API versioning.** Routes are mounted under `/v1` (`src/server.ts`) so future breaking changes
  can live at `/v2` alongside it instead of breaking existing clients.
- **In-memory persistence.** Repositories are plain objects/arrays, not a real database. This
  keeps the project runnable with zero external dependencies — see below for how this would change
  in a production environment.

## Running it

```bash
cd src
npm install
npm run build
node dist/index.js
```

This starts the internal API on `http://localhost:3001` and the mock external API on
`http://localhost:3000`. All internal routes are under `/v1`, e.g.
`POST http://localhost:3001/v1/purchases`.

Seeded test data (in the mock external API) includes customers `customer-uuid-123` and
`customer-uuid-456`, and products `product-uuid-1` / `product-uuid-2` / `product-uuid-3`.

### Tests

```bash
cd src
npm test
```

Runs the [e2e test suite](src/e2e/purchase.e2e.test.ts) against a
real instance of the server — purchase/refund/credit flows, concurrent purchase safety, and error
cases (unknown customer/product, over-refunding, promo codes, etc.).

## API summary

All routes are prefixed with `/v1`.

| Method | Path | Description |
|---|---|---|
| POST | `/credits/:customerId/grant` | Add credit (`{ amount, note? }`) |
| POST | `/credits/:customerId/deduct` | Remove credit (`{ amount, note? }`) |
| GET | `/credits/:customerId/balance` | Current balance |
| GET | `/credits/:customerId/ledger` | Full credit history for a customer |
| DELETE | `/credits/entries/:entryId` | Remove a ledger entry (correcting mistakes) |
| POST | `/purchases` | Purchase a product (`{ customerId, productId, quantity, promoCode? }`) |
| GET | `/purchases?customerId=...` | List a customer's purchases |
| POST | `/purchases/:id/refund` | Refund fully or partially (`{ amount?, note? }`) |
| DELETE | `/purchases/:id` | Delete a purchase record (manual correction, not a normal flow) |

## What I skipped, why, and how I would implement it

- **Real database.** Everything is in-memory, In production
  I'd back this with Postgres — the ledger table in particular maps cleanly onto a relational
  schema, paving way for foreign keys of creditId, purchaseId, refundId, etc. An actual DB also gives a
  permanent home to the data and does not reset on server restarts. The repository layer was designed to be isolated
  behind plain functions, so swapping the implementation shouldn't require touching services or routes.
- **Caching** With an in-memory storage caching is not really possible. This would be done in tandem with the **Real database**
  specified above. I would implement this similarly how we implement the in-memory repositories right now, most likely I would
  create a TTL cache since that is most in line with my skills. Ideally a cache invalidation webhook or cache event listener
  would operate better. First one would depend on the team owning the external API to provide, and second one would require
  the DBA of the real database to provide an event queue of some sorts.
- **Security/Authentication** — Doesn't make sense to implement given that we are querying the server directly in a local
  environment. Ideally the user would be given a security token on access, which would then be continually passed through
  all routes via the header. If they wander into a route they don't have access to we'd send a 401 error. Without a landing
  page or way to actually assign such a security token, I've opted to pass on this for now.
