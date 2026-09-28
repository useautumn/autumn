---
author: john + claude
feature: balance-worker-locks
date: 2026-09-21
status: ready-for-review
---

# Lock and finalize on the balance worker

## What's inside

- `data-model/how-a-lock-is-stored-today.md` — the Redis receipt, and the one fact that shapes everything: a lock is a real deduction plus a record of how to undo it.
- `decisions.md` — the open questions, settled one at a time.
- `units.md` — the ordered units of work, and unit 1's slices.

## Open questions, in order

| # | question | status |
|---|---|---|
| 1 | Finalize only carries `lock_id`. How does it reach the customer's partition, and where does the lock live? | **settled** — Postgres row, one indexed read |
| 2 | Same `lock_id` used twice | **settled** — open lock ids cached in the customer's memory, checked inside `decide` |
| 3 | What lives in memory | **settled** — ids only, full row in Postgres. Cap still to pick |
| 4 | Expiry | **settled** — EventBridge for caller expiries, a self-pacing sweep loop for the rest and as backup |
| 5 | The refund rules to port | **settled** — finalize emits deltas like a track: split, unwind backwards, forward deduct |

## Todos before locks ship

- A customer load in flight can undo an evict. Written up in `plans/balance-worker-concurrent-writers.md`.

Next: unit 1, slice 1. Still open: usage events on the worker path, the cap on open locks per customer.
