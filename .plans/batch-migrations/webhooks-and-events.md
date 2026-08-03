# Batch migrations — Tinybird events + webhooks

## Findings that shape the plan

1. **The lanes write different DB shapes.** Per-customer `update_plan` +
   `customize.add_items` goes `computeUpdateSubscriptionPlan` → `computeCustomPlan`
   → `insertCustomerProducts: [new cusProduct]` + expire-old. The batch lane
   patches the existing cusProduct in place. Parity is therefore behavioural,
   not structural. (U1 measures the exact diff, incl. `is_custom` — John: the
   new row should NOT be `is_custom = true`.)
2. **`products.updated` scenario**: `AttachScenario` has no "items updated"
   value (`new, upgrade, renew, update_prepaid_quantity, downgrade, cancel,
   expired, scheduled, active, past_due`). The customize path emits `"new"`
   today via `getInsertScenario`. Decision (John): batch emits `"new"` too.
3. **Webhooks must leave the run's lifetime.** At the requested pacing a 600k
   migration's deliveries far outlast the ~5 min of DB work, so dispatch goes
   through its own trigger queue with configurable concurrency (max 100),
   shared by BOTH lanes.
4. **Before-state is free.** The candidate dedup (`NOT EXISTS` on the feature)
   means an inserted row implies the customer lacked it — so
   `balance_changes` / `flag_changes` are exact without loading customers.

## Units

### Phase 0 — foundations
- **U1** lane parity test: same scenario both lanes, diff cusProduct/cusEnt rows.
- **U2** `buildBatchMigrationBillingPlan`: phantom `AutumnBillingPlan`
  (`patchCustomerProducts`) from patch product snapshot + inserted rows
  (requires threading inserted rows into `PageResult`).

### Phase 1 — Tinybird events
- **U3** response synthesis (`PreviewMigrateCustomer` shape + `lane: "batch"`).
- **U4** emit one `insertMigrationItemEvents` batch per page (succeeded +
  skipped); replay re-emits (at-least-once) — documented.

## Status (implemented)

Phases 0/1 done (parity test, phantom plan, Tinybird events). Phases 2/3 done
for the BATCH lane: run-level params → resolution → own queue → delivery.
Deferred: U11 (per-customer lane routes through the same dispatcher) — by
John's instruction, last.

Decisions taken during implementation:
- Params live on the RUN (`/migrations.run`), not the migration definition,
  and are NOT persisted — carried on the payload only.
- Resolution moved OUT of the request path into the run task: sizing the
  scope + reading Svix endpoints are both too slow for the API response.
  The count is bounded (`limit = threshold + 1`) since exact size past the
  threshold can't change the decision.
- Defaults: concurrency 100, max 250, auto-disable above 100k customers.
- Svix gating: `filterSubscribedEvents` — an endpoint with no `filterTypes`
  receives everything; no subscription → delivery resolves off.
- Trigger.dev copies a queue per `concurrencyKey`, each with the FULL limit
  (verified in docs) — so the delivery queue is `concurrencyLimit: 1` keyed
  by migrationRunId: one batch in flight per run, runs never block each
  other, and in-batch fan-out is the operator's `webhook_concurrency`.
- `products.updated` fires scenario `new` (what the customize path emits).

### Phase 2 — config surface
- **U5** `send_webhooks`, `webhook_concurrency` (1–100) on `migrations`,
  snapshotted onto `migration_runs`.
- **U6** default resolution at run start: `null` → count > 100k ? off : on
  (counts are cheap post-U3 of fast-customer-select).
- **U7** frontend fields.

### Phase 3 — shared dispatch
- **U8** `queueMigrationWebhooks({ ctx, run, records })` — single entry point,
  chunks ~500 lean records/message.
- **U9** `sendMigrationWebhooksTask` + own queue, `concurrencyKey =
  migrationRunId`, in-task `p-limit(webhook_concurrency)`. ⚠ verify
  Trigger.dev dynamic-concurrency API first.
- **U10** wire batch finalize. **U11** wire per-customer lane via a dispatch
  mode (`inline` default; migrations pass `queued`).

### Phase 4 — tests
- **U12** payload parity across lanes, concurrency adherence, send_webhooks
  false, cancel stops pending, replay doesn't double-send.
