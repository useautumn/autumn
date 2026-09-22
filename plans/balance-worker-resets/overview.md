---
author: john
feature: balance-worker-resets
date: 2026-09-22
status: approved-for-implementation
---

# Balance resets on the worker

A reset is a function of time, not a command. The engine runs one pure step,
`advanceResets({ state, asOf })`, at the top of every apply. Any row with
`next_reset_at ≤ occurredAt` resets there, and the command lands on the fresh cycle.

```
track / check ─┐  ┌── engine.apply(command, occurredAt) ─────────┐
               ├─►│ 1. advanceResets(state, occurredAt, inputs)   │──► log
tick (cron) ───┘  │    → reset changes + balances.reset outcome    │     ├─► committer ─► PG
                  │ 2. the command itself, on the new cycle       │     └─► herald
                  └───────────────────────────────────────────────┘

cron sweep: due cusEnts ─► rolled-out customer ─► tick(customer, now)
                        └► legacy customer    ─► batch SQL (unchanged)
```

## Decided

1. **One function, every path.** Lazy (any command), cron (`tick`), and replay produce the same
   outcome record. `balances.reset` webhooks fall out of it later.
2. **The worker is the sole reset writer** for rolled-out customers. The CAS / `skipped` machinery
   in `reset_customer_entitlements` and `promoteDuePooledContributions` exists for multi-writer
   races the worker doesn't have; the flush keeps a stale guard on `next_reset_at`.
3. **Reset inputs are read behind a pure gate, never on the envelope.** The subscription anchor
   and pool contributions are fetched in the handler only when `dueResets` is non-empty, then
   passed into apply. Check and track pay nothing unless a reset is due.
4. **`subscriptions.billing_cycle_anchor_seconds` is the anchor source**, not
   `customer_products.billing_cycle_anchor`.
5. **Readers project, writers tick.** Server reads over PG rows apply the same pure function
   without writing; billing writers (attach/update) send a store-durable `tick` before reading,
   then evict as today.
6. **Cron is visibility, not correctness.** With resets in-engine it only matters for idle
   customers, so it can be throttled.
7. License-keyed pools stay legacy; the worker doesn't serve them.
8. **`ensureSubjectCurrent` is the seam.** A subject is current for a command when its rows are
   resident and its cycles are up to the command's clock; that is one processor action every
   command handler calls first. The hydrator stays a loader; a reset is a decision, so it can't
   live inside `ensure`.
9. **There is no `tick`.** The cron sends the same `reset` command the implicit path decides.
10. **A reset is its own record.** The trigger (track, check, finalize, tick) decides a synthetic `reset`
   command first, at its own revision; the command's record follows. One record shape whatever
   triggered it, and a check never has to carry a mutation.
11. **The reset math lives in `shared/utils/cusEntUtils/resetUtils/` and nowhere else.** Bodies moved
   from the server verbatim; the engine and `getResetAtUpdate` call the same functions, so the
   worker's `next_reset_at` and balances are byte-identical to today's, edge dates included.
12. **The worker never holds subscriptions** (nor invoices, free trials, licenses). A subscription
    never changes a balance decision; the anchor is a gated Postgres read at reset time, never
    resident, so `sub.updated` needs no worker evict. Only the API reads (`customers.get`,
    `entities.get`) need those tables, and where they render `current_period_end` from is decided
    with the Redis FullSubject cache's retirement, not here.
13. **Resets are addressed to subjects, not customers.** An entity's rows sit in the entity's state, so a
    customer-identity reset never sees them; the cron and `getFull` send one reset per (customer, entity)
    with due rows. An entity's reset may also carry customer-row changes, the way an entity's track does.
14. Only `runResetLoopV2` (batch reset, via `processReset`) and the lazy path run in prod; `resetCron`
    V1 is dead code and was only re-pointed, not reasoned about.

## Open

- **The cron's lane split rides the global rollout flag for now** (`isBalanceWorkerRolloutEnabled`,
  read once per sweep): on → `queue.reset` per customer, off → SQL lane. This will likely need a
  per-customer or per-org routing decision once rollout is partial; the two-lane test is the guard
  to keep when that changes.

- **Rollover cap on a prepaid row with a scheduled quantity change** should follow `upcoming_quantity`
  at the reset; today it uses the current quantity. Pinned as `test.failing` in
  `server/tests/unit/rollovers/cus-ent-to-effective-rollover-max.test.ts`. Fix is
  `cusEntToEffectiveRolloverMax` taking `useUpcomingQuantity`, plumbed from the reset.

- **Dual resets between lazy and cron must be impossible.** Rolled-out customers: both paths are
  `reset` records on one partition, so the second finds nothing due; but the cron's SQL lane must
  never touch a rolled-out customer's rows, and the transition while a customer is rolling out
  needs a proof (test: lazy and cron racing on the same due row refill it exactly once).

- Server unit files under `tests/unit/balances/{balanceWorker,replay}` fail on this worktree
  before and after this work; they carry uncommitted edits from the get-or-create slice.

- **Unify `getNextResetAt` with `getCycleEnd`.** They agree on a single step; they differ when a row
  catches up several month-end cycles at once (stepping clamps Jan 31 → Feb 28 → Mar 28, the anchor
  math gives Mar 31) and `getCycleEnd` needs a fixed anchor, which `reset_cycle_anchor` only holds on
  rows written by batchTransition. Doing it changes prod resets on those dates, so it is its own
  change with its own parity test, after the worker matches today's path byte for byte.

- Where the worker reads `persist_free_overage` (org config) from.
- Whether usage windows take part in a reset at all.
- `resets_via_invoice` rows are reset by `invoice.created`, out of band: that path must evict.
- Herald `balances.reset` delivery is a later unit under `plans/herald`.
