# Migration replayability: parked work and resume guide

**Status: parked, partial prototype. Updated 2026-09-22.**

The goal is to recover a migration whose SQL committed but whose cache invalidation or webhook submission failed. The saved prototype can reuse original SQL results for add/repoint operations. It does **not** yet make a production migration safely replayable end to end.

This document records the checkpoint, the agreed direction, and the work still needed. It does not enable recovery or add its table to `dev`.

## Where the work is saved

- Remote branch: [`origin/investigate-migration-failures`](https://github.com/useautumn/autumn/tree/investigate-migration-failures).
- Recovery checkpoint: [`5ca6808e351f1c79f4370a4061064acd90705734`](https://github.com/useautumn/autumn/commit/5ca6808e351f1c79f4370a4061064acd90705734), `wip(migrations): checkpoint compact SQL batch recovery`.
- Original detailed design: [`plans/migration-recovery.md` at that checkpoint](https://github.com/useautumn/autumn/blob/5ca6808e351f1c79f4370a4061064acd90705734/plans/migration-recovery.md). This includes the earlier ownership, cancellation, storage, and acceptance matrix.

The remote branch was verified at that checkpoint when this document was written. Prefer the immutable commit when investigating it later. The local `investigate-migration-failures` branch also contains two later mitigation commits, `e0debf1b56` and `f11589ef99`; those do not represent additional recovery implementation.

The urgent mitigation work was shipped separately through [PR #3542](https://github.com/useautumn/autumn/pull/3542), from `fix/migration-cache-and-webhooks`. Its final branch commit is `1e9ccf7b4bb758f6e418b0e13362dbd8faededb3`. Do not merge the recovery branch just to obtain those fixes: they are already on `dev`.

## The failure we were solving

Consider a migration that adds an entitlement and moves customer products from plan v1 to v2:

```text
┌──────────────────────────┐       ┌──────────────────────────┐
│ Postgres                 │       │ Redis / webhook consumer │
│ SQL committed            │       │ Still sees old state     │
│ Entitlement added        │       │ Cache clear failed, or   │
│ Product now points to v2 │       │ event was never accepted │
└──────────────────────────┘       └──────────────────────────┘
                 │
                 │ start a fresh migration run
                 ▼
┌────────────────────────────────────────────────────────────┐
│ The v1 filter no longer finds this customer.                │
│ Or SQL returns “already updated” with no original changes.  │
│ Neither result tells finalization what still needs repair. │
└────────────────────────────────────────────────────────────┘
```

Making SQL converge on the desired state is insufficient. Recovery also needs the original page membership and original change results, so it can finish the effects of the committed write.

There are two scopes. **Part 1** is replayability after partial completion. **Part 2** is finding and removing the cause of Redis stalls. The timeout changes reduce failures; they do not establish that the underlying stall cause is fixed.

## What “complete” means

A page should be complete only after its SQL has committed, required cache invalidation has finished, and **Svix has accepted every required webhook event**. A successful Trigger enqueue is not proof of Svix acceptance.

Failures at the recipient's HTTP endpoint remain Svix delivery/replay concerns after acceptance. We are not making migration completion wait for a customer endpoint to return 2xx.

The same original results must remain usable for Tinybird/item-event builders. Their retry and duplicate-handling behavior still needs to be specified and tested; the prototype does not give those events an exactly-once guarantee.

## Keep the existing execution structure

```text
┌────────────────────────────────────────┐
│ runMigrationTask                       │
│ Parent dispatches chunk tasks          │
└───────────────────┬────────────────────┘
                    ▼
┌────────────────────────────────────────┐
│ runBatchMigrationChunkTask             │
│ Ordinary loop: up to 20 pages          │
│ Yields earlier near its time budget   │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ Page: up to 5,000 customers        │ │
│ │ Bounded SQL transactions          │ │
│ │ Deferred cache and event work     │ │
│ └────────────────────────────────────┘ │
└───────────────────┬────────────────────┘
                    │ existing webhook queue
                    ▼
┌────────────────────────────────────────┐
│ sendMigrationWebhooksTask              │
│ 50 records per task on current dev     │
│ Must report Svix acceptance            │
└────────────────────────────────────────┘
```

A page stays a function inside a chunk. We rejected adding a Trigger task per page because it adds scheduling/cold-start overhead and defeats the purpose of chunking. An unused page-task prototype was removed before the checkpoint.

The saved Trigger experiments showed that retrying a task reruns ordinary code from its beginning. Trigger does not automatically retain every local function's input/result. Successful child-task reuse helps at those task boundaries; it does not close the gap between a Postgres commit and the task's result being saved.

Keep Trigger as the chunk retry mechanism. Persist the minimum recovery facts in Postgres. Do not add a generic workflow framework, another wrapper for each operation, or a broad folder restructure.

## What the checkpoint implements

### One SQL recovery boundary

`server/src/internal/migrations/v2/repos/migrationBatchResult/withMigrationBatchResult.ts` owns the save/reuse transaction:

```text
┌────────────────── one bounded transaction ──────────────────┐
│ Insert identity row                                        │
│                                                            │
│ New identity: execute SQL → encode result → save result     │
│ Existing identity: verify input → return original result    │
│                                                            │
│ SQL and saved result commit together, or both roll back.    │
└────────────────────────────────────────────────────────────┘
```

Concurrent attempts collide on the primary key. The losing insert waits, then a separate statement reads the winner's committed result. Reusing an identity with different JSONB input fails. A result-conversion failure rolls back the SQL too.

Without recovery input, the helper runs the existing SQL transaction normally. It performs no Redis or webhook calls. Inputs/results use typed conversions without runtime Zod `.parse` calls in this save/reuse path.

### Prototype schema and identities

The checkpoint adds `migration_batch_results` in `shared/models/migrationV2Models/migrationBatchResultTable.ts`:

```ts
{
  org_id: string;
  env: string;
  batch_id: string;
  version: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  created_at: number;
}
// Primary key: (org_id, env, batch_id)
```

`result: null` is an uncommitted placeholder inside the transaction. A committed result must exist before replay can succeed. Version 1 stores the original full result; version 2 stores the compact representation. The helper can read earlier version-1 results and rejects unsupported versions.

The current identity is deterministic for the original execution:

```text
operationId = JSON.stringify([
  migrationRunId, pageId, patchIndex, operationType, addIndex?
])

add batchId = JSON.stringify([
  operationType, operationId, afterCustomerProductId ?? null
])

repoint batchId = JSON.stringify([
  "repoint-customer-products", operationId
])
```

`getMigrationOperationId.ts` owns the operation identity. Here `migrationRunId` is Autumn's application run ID, not a Trigger attempt ID. Retrying a chunk must preserve its original work inputs while ownership tracks the current attempt. A normal fresh migration run has a new `migrationRunId`, so it does not automatically reuse another run's SQL results. Repairing old work from a new run will need explicit discovery of that work and reuse of its **original** identity. That discovery is not implemented.

### Resuming after batch 5

`execute/customerProductPagination/iterateCustomerProductPages.ts` routes every candidate batch through the same SQL helper. Its `onPage` callback collects a fresh **or saved** result; it is not a separate recovery mechanism.

```text
First attempt:  [1 saved] [2 saved] [3 saved] [4 saved] [5 saved] [6 fails]
Retry:         [1 reuse] [2 reuse] [3 reuse] [4 reuse] [5 reuse] [6 execute]
```

Saved candidate rows restore the next customer-product cursor. Replaying the earlier results rebuilds the original inserted/repointed changes without rerunning their mutations. The same customer page can contain several candidate batches: the page limit is 5,000 customers, while the default candidate batch is 10,000 customer-product rows.

`executeBatchMigrationPage.ts` accepts `recovery: { pageId, effectiveAt }`, preserves the effective timestamp, and passes stable identities to add/repoint. Add uses the pagination helper; repoint calls the same SQL helper once at the page orchestration layer. This keeps the transaction/reuse logic in one place.

### Compact results have their own layer

```text
batchOperations/execute/recovery/
├── getMigrationOperationId.ts
├── assertMigrationPageRecovery.ts
├── types/migrationPageRecovery.ts
└── compactResults/
    ├── addBatchResultToCompact.ts
    ├── compactToAddBatchResult.ts
    ├── repointBatchResultToCompact.ts
    ├── compactToRepointBatchResult.ts
    └── types/
```

Actions and finalizers still use readable full result types. The recovery layer converts those results to storage and back. The compact representation stores shared fields once in `defaults`, with named row identities and overrides in `rows`. Add also retains candidates and exclusions. Optional `remaining` stays per row to preserve absent/null/zero distinctions.

These are original changed-row facts, not full customer snapshots. They preserve the information needed to rebuild original billing changes when paired with the original prepared plan/features. **The current prototype still repeats execution inputs and stores candidate arrays.** Moving shared inputs to a saved page and reducing candidates to count/cursor are planned reductions, not completed work.

### Supported operations and wiring

Only add and repoint have result-recovery coverage. `assertMigrationPageRecovery.ts` rejects remove, replace, and license operations when recovery is requested. Shared pagination edits in those actions do not mean their replay semantics are implemented.

No production chunk caller supplies the page recovery input. Parent/chunk automatic retries remain at one attempt through `MIGRATION_TASK_RETRY`. The existing transient database page retries are separate and do not establish durable recovery.

## What remains unsafe or unfinished

The prototype still marks item runs succeeded/skipped inside `executeBatchMigrationPage`, before deferred cache work. Existing run cleanup can release claims on failure. The original page is not saved atomically with its claim. Those behaviors must change before enabling automatic recovery.

A complete protocol needs the following sequence:

1. **Claim and save the page together.** Save original membership, cursor, effective time, normalized prepared input, and webhook policy in the same short transaction as claiming customers. An empty selection/cursor advance also needs a saved outcome.
2. **Reuse committed SQL.** Keep original operation identities and bounded transactions. Verify current attempt ownership and closed state inside each mutation transaction.
3. **Finish required effects.** Rebuild original changes, invalidate caches, and dispatch bounded webhook batches. Record acceptance rather than only enqueue success.
4. **Complete atomically.** Settle the page and customer claims after required effects. Save cursor/count summaries so a chunk retry does not double-count completed pages.
5. **Close the chunk.** Drain required effects and persist a small closed summary. A later replay of a closed chunk returns that summary without rerunning SQL or sending events.

A chunk retry must load saved pages **before** selecting with the current filter. Completed pages return their summaries; unfinished pages resume with original inputs. This is what repairs the v1→v2 case in the first diagram.

The proposed schema direction is to reshape the prototype recovery table with indexed migration/run/chunk/page associations and page, SQL-result, webhook-batch, and closed-chunk records. Customer claims may need a nullable page association/index. These fields and indexes are not present in the checkpoint; do not treat the current opaque `batch_id/input/result` schema as sufficient.

### Ownership, timeouts, and fresh-run repair

Original work identity and current attempt ownership must be separate. A new execution can take over only after the old executor is confirmed stopped. A promise timeout does not cancel SQL, a Redis call, or a provider request; marking claims failed while the old worker continues can create overlapping mutations.

Use transactional ownership/closed-state checks, including synchronization with cleanup. A top-level ownership check alone cannot prevent an old worker from writing after a takeover or pruning.

Unresolved pages must keep their customer claims protected from unrelated migrations. Completed claims should be released promptly. Cancellation stops new claims and drains existing work where possible; hard cancellation must account for active chunk and delivery tasks. Canceled work requires explicit resume authorization.

A fresh-run repair route must discover unfinished original work before applying the new filter. Preserve `only`, limits, and skipped/failed selection semantics: a narrow retry must not silently execute uncommitted old SQL outside its scope. Repair counts belong to the original work, separately from newly selected work. Historical migrations that never saved their original changes still require reconciliation.

### Webhooks without excessive latency

Keep the existing delivery tasks, per-run queue, configured webhook concurrency, and bounded overlap between pages and side effects. Do not send to Svix inside SQL transactions or write one acknowledgement per message. Save one acknowledgement per webhook batch after every required message is accepted.

Subscription lookup failures must retry, not become an accidental “no webhooks configured” result. Migration senders must propagate required-message failures; current best-effort behavior is not enough. Make this strict for migrations without changing unrelated webhook callers.

Persist original batch membership, required event types, stable event identities, first-attempt time, and acceptance. On partial success, retry/reconcile the same identities. Delivery tasks must also respect closed markers, including manual replay after cleanup.

`billing.updated` needs the original changes. `customer.products.updated` remains a current-state refresh rebuilt from lean IDs at delivery time. Missing source objects need an explicit unresolved/superseded outcome, not a silent success.

Provider idempotency and message lookup have finite guarantees. Verify the current Trigger/Svix retention and deduplication windows before implementing; do not promise indefinite exactly-once submission. If an old response is ambiguous after those windows, require explicit reconciliation/resend.

Reported completion may take longer because it includes Svix acceptance. Measure migration throughput and concurrent API p95/p99 before claiming minimal latency impact.

## Storage and cleanup

The earlier storage probes used synthetic data and PostgreSQL JSONB/TOAST. They measured a proposed fuller compact representation, not the entire checkpoint implementation or a production migration.

For 5,000 customers, ten added features plus repointing measured about **3.94 MB** of table/index/TOAST storage for compact results, plus **0.38 MB** for a minimal page identity snapshot. That is about **4.32 MB per page**, or **2.59 GB for 3 million similar customers if every page remains retained**. Webhook records, full prepared plans, additional metadata, and larger customer-product fanout are excluded.

For one add plus repoint, the corresponding result measurement was about 0.76 MB before the 0.38 MB page snapshot. Do not use either figure as a guaranteed storage ceiling. The current prototype's repeated inputs/candidates also need reduction.

Cleanup is part of correctness. Add the requested cron as the final implementation unit, but design the closed-state contract before enabling retries:

- Prune bulky records only for fully resolved, safely closed chunks. Retain a small durable completion summary that prevents old SQL or delivery tasks from running again.
- Preserve unfinished work regardless of age. A failed run may contain safely closed chunks, but its incomplete chunks must remain recoverable.
- Delete in bounded batches and measure cleanup lag, WAL, vacuum, and TOAST behavior. Deleted rows do not immediately imply smaller allocated disk.

Set an explicit storage admission budget before rollout. When capacity is low, stop new claims, drain existing work, close/yield the chunk, and let cleanup make room. Do not wait for the whole migration to finish before reclaiming successful chunks. No final storage or latency budget has been approved.

## Evidence retained in the checkpoint

The following are historical results recorded when the prototype was parked, not tests rerun for this documentation change.

| Evidence | Recorded result |
|---|---|
| Compact wiring checks | 11 tests, 99 assertions passed |
| Direct SQL/cache replay proof | 1 test, 25 assertions passed |
| Server typecheck and scoped formatting | Passed at checkpoint |
| Original-version filter recovery | Known failing reproduction |

The direct cache test **manually reuses original serialized page inputs** after a forced Redis failure. It proves cache repair without repeated SQL once those inputs are supplied. It does not prove automatic chunk restart or fresh-run discovery.

Useful files on the saved branch:

- `server/tests/integration/billing/migrations-v2/batch-migrations/recovery/migration-batch-result.test.ts`: original result reuse, concurrent attempts, atomic rollback, legacy reads, and conversion failures.
- `.../recovery/add-batch-recovery.test.ts`: batches 1–5 commit, batch 6 fails, retry resumes safely.
- `.../recovery/add-repoint-recovery.test.ts` and `repoint-atomic-recovery.test.ts`: interrupted additions/repointing retain original results.
- `.../recovery/page-cache-recovery.test.ts`: manual original-page replay repairs stale cache without repeating SQL.
- `.../recovery/batch-cache-recovery.test.ts`: stable-filter and original-version-filter scenarios. The original-version case remains red until page discovery is implemented.
- `server/tests/unit/migrations-v2/batch-operations/recovery/`: compact add/repoint round trips, heterogeneous values, and 5,000-row size checks.

[`server/experiments/migrationRecovery/README.md`](https://github.com/useautumn/autumn/blob/5ca6808e351f1c79f4370a4061064acd90705734/server/experiments/migrationRecovery/README.md) records isolated Trigger development experiments. They reproduced SQL result loss after commit/throw or process exit, demonstrated result reuse with the SQL helper, and distinguished automatic retries from manually starting a new run. The helper-signature adjustment was not followed by another Trigger probe run. They are not production performance or cloud-crash coverage.

The older plan references `/tmp/zagreb-*` logs and storage scripts. Those are local, ephemeral evidence, not dependable handoff artifacts. Rerun the committed tests/probes in an isolated environment when resuming.

## Immediate fixes already on dev

[PR #3542](https://github.com/useautumn/autumn/pull/3542) reduced the likelihood of the original incidents:

| Area | Current mitigation |
|---|---|
| Webhook task | 2 GB machine; 50 records |
| Task submission | `batchTrigger`, preserving concurrency keys |
| Redis pipeline | 250 subjects by default |
| Migration Redis command timeout | 10 seconds, existing client |
| Deferred cache/item-event deadline | 5 minutes |
| Migration chunk maximum duration | 30 minutes |

Current code owners:

```text
server/src/
├── internal/migrations/v2/
│   ├── webhookDelivery/utils/queueMigrationWebhooks.ts
│   ├── webhookDelivery/utils/migrationWebhookDeliveryQueue.ts
│   └── batchOperations/finalize/invalidateBatchMigrationCaches.ts
├── internal/customers/cache/fullSubject/actions/invalidate/
│   └── batchInvalidateCachedFullSubjects.ts
├── external/redis/utils/createRedisPipeline.ts
└── trigger/migrations/
    ├── sendMigrationWebhooksTask/sendMigrationWebhooksTask.ts
    └── migrationTaskQueue.ts
```

These are mitigations. They do not persist original pages, make webhook acceptance strict, or prevent timed-out promises from continuing. The saved recovery branch predates these changes and still mentions 500-record webhook batches in its archived plan. Resume from current `dev` and retain the 50-record behavior.

## Resume in small reviewable units

1. **Storage and lifecycle contract.** Finish compact input/count/cursor storage, indexed original identities, ownership, and durable closed summaries. Set a measurable admission-budget design. Keep retries disabled.
2. **Original-page claim and discovery.** Save and claim together inside the existing loop. Make the known version-filter reproduction pass. Prove batch-6 continuation, fresh-run scope controls, and safe ownership transfer.
3. **Truthful effect completion.** Add strict webhook policy/submission, stable identities and batch acknowledgements. Move success marking after cache plus Svix acceptance. Define Tinybird/item-event replay behavior.
4. **Real retry and performance proof.** Exercise actual Trigger crash, retry, cancellation, multiple pages, lost provider responses, and count reconstruction. Measure SQL/storage overhead and API latency under load.
5. **Cleanup cron and gated rollout.** Delete only safely closed bulky records, preserve unresolved work, and prove old task replays cannot repeat effects after pruning. Enable automatic chunk retries only for supported operations after these gates pass. Extend remove/replace/license and per-customer/Stripe recovery separately.

Split each unit into 1–3 source-file review slices. Keep recovery mechanics centralized and names readable. Avoid runtime Zod parsing in the recovery conversions. Do not enable retries merely because the SQL result tests pass.

Start by inspecting the checkpoint rather than merging it wholesale:

```sh
git fetch origin dev investigate-migration-failures
git show --stat 5ca6808e351f1c79f4370a4061064acd90705734
git diff 5ca6808e35^ 5ca6808e35 -- server/src/internal/migrations/v2
```

Create a fresh worktree from current `origin/dev` for implementation. Port the recovery changes deliberately; the current branch is behind later production fixes. Its Drizzle migration is `shared/drizzle/0082_even_raider.sql`, with generated snapshot/journal changes. Regenerate/rebase the schema migration against current `dev` using the DB migration workflow; do not blindly apply the old number or snapshot.

Use the Autumn worktree setup (`bun i`, `bun dw setup` as needed), then run the narrowest relevant tests through `bun tw`. Integration tests may use Stripe, so run one named case at a time and save complete output. Recheck the real Trigger experiments before claiming durable task replay works.

**Next concrete milestone:** a committed v1→v2 page remains discoverable after Redis failure, and replay repairs its cache from original saved results without repeating SQL. Stop there for review before broadening webhook recovery or enabling automatic retries.
