# Load Testing

Artillery-based load tests for the Autumn server, with Stripe-integrated attach cycling.

## Quick Start

```bash
cd server

# 1. One-time setup (creates products + 500 customers with Stripe PMs)
bun loadtest:setup

# 2. Run load test
bun loadtest:leak    # memory leak detection (11 min, ~30 req/s)
bun loadtest         # general load test (4 min, up to ~75 req/s)
```

## Prerequisites

1. Server running on `localhost:8080` (`bun d`)
2. `UNIT_TEST_AUTUMN_SECRET_KEY` and `TESTS_ORG` available via infisical (the npm scripts handle this)
3. Setup script has been run at least once (`bun loadtest:setup`)

## Setup Script

`setup.ts` creates everything needed for the load test:

**Products** (all in the `load-test` group for upgrade/downgrade):

| Product ID | Type | Price | Features |
|---|---|---|---|
| `load-free` | Default (free) | $0 | dashboard (boolean), messages (100/mo) |
| `load-pro` | Subscription | $20/mo | dashboard, messages (1000/mo) |
| `load-premium` | Subscription | $50/mo | dashboard, messages (unlimited) |
| `load-messages` | Add-on (one-off) | $10 | messages (+500, one-time) |

**Customers**: 500 customers (`load-cus-001` to `load-cus-500`), each with:
- A Stripe customer with `tok_visa` payment method attached
- Auto-assigned `load-free` via default product group
- Mapping saved to `.customers.json` (gitignored)

The setup script is idempotent — safe to re-run.

## Scenarios

Both configs run two weighted scenarios:

### Core API loop (90% of virtual users)

Each VU makes 3 requests:
1. `POST /v1/check` — check feature access
2. `POST /v1/track` — track usage
3. `GET /v1/customers/:id` — fetch customer

### Attach flow (10% of virtual users)

Each VU makes 2 requests:
1. `POST /v1/billing.attach` — upgrade/downgrade to a random product
2. `POST /v1/check` — check feature access after attach

Since all subscription products share the `load-test` group, attaching a different product triggers an upgrade or downgrade through Stripe. Attaching the same product the customer already has is handled gracefully (no-op or returns existing).

## Load Profiles

### `memoryLeak.yml` — Memory leak detection

| Phase | Duration | VU/sec | ~Req/sec | Purpose |
|---|---|---|---|---|
| Warm-up | 30s | 1 -> 3 | 3-9 | Gentle start |
| Ramp | 60s | 3 -> 10 | 9-30 | Gradual increase |
| Sustained | 600s | 10 | ~30 | Leak detection window |

At sustained 10 VU/sec: ~9 core loop VUs (~27 req/s) + ~1 attach VU (~2 req/s).

### `artillery.yml` — General load test

| Phase | Duration | VU/sec | ~Req/sec | Purpose |
|---|---|---|---|---|
| Warm-up | 30s | 1 -> 5 | 3-15 | Warm caches, JIT |
| Ramp to peak | 60s | 5 -> 25 | 15-75 | Find breaking point |
| Sustained | 120s | 25 | ~75 | Sustained peak |
| Spike | 30s | 25 -> 50 | 75-150 | Brief spike |

## Memory Leak Debugging Workflow

1. Start server: `bun d`
2. Take baseline heap snapshot: `curl localhost:8080/debug/heap-snapshot`
3. Run: `bun loadtest:leak`
4. At ~5 min, take mid-test snapshot: `curl localhost:8080/debug/heap-snapshot`
5. When test ends, take final snapshot: `curl localhost:8080/debug/heap-snapshot`
6. Open Chrome DevTools > Memory tab > Load all 3 `.heapsnapshot` files
7. Select the latest snapshot > Summary > switch to Comparison
8. Look at the "Delta" column for objects accumulating between snapshots

Heap snapshots are saved to `server/perf/snapshots/` (gitignored).

## File Structure

```
server/perf/
├── load-test/
│   ├── setup.ts           # Creates products + customers (run once)
│   ├── processor.mjs      # Artillery helper functions (picks random customers/products)
│   ├── artillery.yml      # General load test config
│   ├── memoryLeak.yml     # Memory leak detection config
│   ├── .customers.json    # Generated customer->stripeId mapping (gitignored)
│   ├── .gitignore
│   └── README.md
└── snapshots/
    └── .gitignore         # Ignores *.heapsnapshot files
```
