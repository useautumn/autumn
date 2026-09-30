---
author: john + claude
feature: customer-cache
date: 2026-09-30
status: draft-for-review
supersedes: design/check-document.md
---

# Atom: the BYOC cache is one service image, not a KV + SDK logic

Atom (`apps/atom`) is one image in the customer's cloud that holds each customer's state in SQLite files on a volume and
answers `check` with the balance engine. Autumn ships fixes with `alien release`; the SDK only
changes its base URL and gets a minimal response.

```
 customer pods ──check──► atom (ONE image, one volume)      
                          ┌────────────────────────────────────────┐
                          │ every process listens on the same port  │
                          │ slot = hash(customer_id) % 128          │
                          │ not my slot → forward to its owner      │
                          │ process 1: slot-000…015.sqlite          │
                          │ process 2: slot-016…031.sqlite   …      │
                          │ check: read row → engine.computeCheck   │
                          └───────▲────────────────────────────────┘
                                  │ pulls a per-org feed (outbound only)
 tracks ──► Autumn API ──► balance worker ──► log ──► feed
```

## Decided (John, 2026-09-29/30)

- One image. No DynamoDB, no deduction logic in the SDK.
- The files are the cache's source of truth; processes hold nothing that a restart loses.
- A fixed number of slots, one SQLite file each. Processes own sets of slots, so more or fewer
  cores never moves data. An entity lives in its customer's slot.
- v1 answers `check` only. `track` goes to the Autumn API as today, so a local check lags a
  track by the feed's latency (eventually consistent, accepted).
- Per-entity balances are out of scope.

## What is reused, what is new

| piece | status |
|---|---|
| `computeCheck` and everything under it | reused as-is; rows are stored as the engine's own `SubjectState` + catalog, so there is no second schema |
| Hono app, SQLite store (`subject_states`) | reused from the balance worker (`initialize-check.test.ts` wires them with no Kafka or Postgres) |
| entrypoint: N processes, slot ownership, forward-to-owner | new |
| feed: the image pulls its org's changed subjects and catalog from Autumn | new, both ends |
| auth between SDK and the image; SDK base-URL switch with API fallback | new |

## What falls back to the Autumn API

Image unreachable or restarting · customer not in the file yet (first check loads it) · a reset
is due (the API's reset reaches the file through the feed) · `send_event`, `lock`, `with_preview`.

## Sizing (estimates until benchmarked)

~3,000–5,000 checks/s per core. 500k checks/min = 8,300/s ≈ 2–3 cores. ~1–2 ms from a pod in the
same VPC.

## Deploys

Files survive a restart. A volume attaches to one instance at a time, so old and new never run
together: stop old → start new on the same volume, API fallback for the gap. Schema changes to the
stored rows go readers first: release the image, wait for every deployment, then deploy herald.

## Open

1. Alon: how alien updates a stateful container (stop-then-start on the same volume?), whether a
   volume follows an instance resize, and how the customer's pods reach the image privately.
2. Slot count: 128 proposed. Changing it later costs one cold start (reload from Autumn), not a
   migration.
3. Local `track` (outbox to Autumn, zero-gap handoff between machines): later.
4. Benchmark checks/s per core and p99 on the file-backed path.
