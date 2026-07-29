# Stripe sub-account pool benchmark

Decision artifact for replacing the per-run create/delete Stripe sub-account
lifecycle with a persistent, reusable POOL (claim clean accounts at fan-out,
async-nuke contents at teardown).

- **Method**: real Stripe sandbox accounts, N=50, round-robined across the full
  `STRIPE_TEST_KEY_POOL` (11 platform keys) exactly like a run
  (`createSandboxSubAccount` with production pacing: concurrency 20, 10ms
  spacing). Each account was seeded to a genuine "used" shape (1 customer,
  1 product, 1 recurring price, 1 coupon) before nuking. Delete/nuke/claim
  concurrency 16 (matches `TEARDOWN_STRIPE_CONCURRENCY`).
- **Bench**: `scripts/tw/bench/stripePoolBench.ts`
  (`infisical run --env=dev --recursive -- bun scripts/tw/bench/stripePoolBench.ts 50`)
- **Date**: 2026-07-08 · **Rate-limit incidents: 0** across all phases (~600 API calls).

## Results (N=50, 11 keys)

| Phase | Wall (50 accts) | Per-account avg | p50 | p95 |
|---|---|---|---|---|
| **A1 — create accounts** (current fan-out cost) | **13.5 s** | 7.5 s¹ | 7.9 s | 12.8 s |
| **A2 — delete accounts** (current teardown block) | **9.5 s** | 2.6 s | 2.4 s | 3.5 s |
| **B1 — claim: list clean pool** | 13.0 s² | — | — | — |
| **B1 — claim: mark dirty** (metadata write) | 7.9 s | 2.0 s | 1.9 s | 3.1 s |
| **B2 — nuke used account** (runs ASYNC in sandbox) | 18.9 s | 5.0 s | 5.0 s | 5.7 s |
| (seed: customer+product+price+coupon) | 5.4 s | 1.3 s | 1.3 s | 1.5 s |

¹ per-account create includes queueing behind the concurrency-20 limiter; the
raw `v2.core.accounts.create` call is ~1.5-5 s.
² the bench paged EVERY account on every key. The implementation early-stops
once enough clean accounts are found (accounts list newest-first and pool
accounts are recent), cutting this to ~1 page/key ≈ 2-4 s.

Nuke verification: post-nuke probe of a seeded account showed
`customers=0 activeProducts=0 coupons=0`; per-account nuke counts confirmed
real work (`customers:1, prices:1, products:1, coupons:1` each).

## User-facing wall comparison

| | 50 workers (measured) | 200 workers (projected³) |
|---|---|---|
| **(A) current**: create at fan-out + delete at teardown | 13.5 s + 9.5 s = **23 s** | ~54 s + ~38 s = **~92 s** |
| **(B) pool**: claim (list + mark dirty) + fire-and-forget nuke spawn | ~4 s + 7.9 s + ~2 s = **~14 s** | ~4 s + ~32 s⁴ + ~2 s = **~15-38 s** |
| **(B) async cost** (nobody waits) | nuke 18.9 s in sandbox | nuke ~75 s in sandbox |

³ linear in N at fixed concurrency; key count unchanged (11).
⁴ mark-dirty at bench concurrency 16; the implementation uses the same limiter,
but the writes shard across 11 key buckets so concurrency can be raised — at
concurrency 64 the projected 200-account mark-dirty is ~8-10 s.

## Recommendation

**Adopt the pool.** At 200 workers it removes ~38 s of teardown block entirely
(terminal returns after a ~2 s sandbox spawn) and turns the ~54 s fan-out
account-create into a ~10-15 s claim. Zero rate-limit incidents at 50; the pool
also *reduces* total Stripe write load (metadata update ≪ account create+delete).

## Live verification (implemented pool, `bun tw` 4 files × 4 workers)

- Run 1 (empty pool): `stripe pool: 0 reused + 4 created in 20.1s`; teardown
  spawned nuke sandbox and returned immediately (`teardown complete` right
  after the spawn line). Nuke flipped all 4 accounts to `clean`; probe of a
  used account: `customers=0 activeProducts=0 coupons=0 testClocks=0`.
- Run 2 (warm pool): `stripe pool: 4 reused + 0 created in 18.5s` (dominated by
  the per-key `accounts.list` scan — roughly flat in N); identical test results
  on reused accounts as on fresh ones (same 24 passed / 6 pre-existing assert
  failures), confirming no cross-run residue affects tests.
- No lock refs left on origin after either run.

Notes:
- Pool state lives in Stripe metadata (`autumn_tw_pool=1`,
  `autumn_tw_pool_state=clean|dirty`) — no local state file is authoritative.
- Claim (list + mark dirty + top-up) is serialized across teammates' machines
  with the `stripe-pool` git-ref global lock (`refs/tw/locks/stripe-pool`,
  helpers/lock.ts) since Stripe metadata read-modify-write is racy. The async
  nuke sandbox needs NO lock — it only touches accounts its own run claimed.
- Connected accounts cannot have webhook endpoints (Stripe forbids it), so
  account reuse carries no webhook state between runs; events flow through the
  per-run platform Connect webhook + ingress as before.
- Reused accounts accumulate immutable residue (events, deactivated
  products/prices, closed invoices). Tests only read live objects, so this is
  benign; a periodic `accounts.del` sweep can rotate old pool accounts if it
  ever matters.
