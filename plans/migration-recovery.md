# Migration recovery: reviewable design

Status: paused checkpoint; partial implementation, not production-ready. Compact SQL result save/reuse for add and repoint is implemented and tested. Original-page persistence, claim ownership, strict webhook completion, automatic chunk retries and scheduled cleanup remain unfinished.

Resume with original-page persistence: atomically claim customers and save their original page, then load saved pages before selecting through the current filter. Keep the existing chunk/page execution structure. The `original version filter` case in `batch-cache-recovery.test.ts` is a known failing reproduction of this unfinished discovery path; it is not included in the 11 passing focused checks below. Redis stalls themselves remain a separate investigation.

## Recommendation

Keep the existing Trigger chunk and its ordinary page loop. Persist the original page claim and compact committed SQL results in the existing recovery table. Keep webhook submission on the existing delivery tasks. Finish a page only after its cache is cleared and Svix has accepted the required messages.

```text
Trigger retries the existing chunk
  load saved page, or atomically claim + save a new page
  execute/reuse its bounded SQL batch results
  clear cache + submit existing webhook batches
  record confirmed acceptance
  mark page/customers complete together
  continue with the saved cursor
```

Completed pages return their saved cursor/counts. An incomplete page returns its original customer list and original prepared input, including after those customers no longer match the filter. SQL batches already committed return their original changes; incomplete batches execute. No task per page, full-page SQL transaction, generic workflow scheduler, or folder restructuring.

This deliberately replaces the most recent suggestion to preselect an entire chunk. Code review showed that chunks are dynamically sized by both page count and time remaining; preserving that behavior is less invasive than fixing their entire membership before dispatch.

## What the research established

- `runBatchMigrationChunk.ts` claims up to 5,000 customers per page, executes bounded SQL, overlaps deferred effects, and yields after up to 20 pages or when its deadline approaches. `claimNextBatchMigrationPage.ts` selects and claims together; moving selection outside the chunk changes this ownership boundary.
- `executeBatchMigrationPage.ts` currently marks customers succeeded/skipped before cache work. `withMigrationRunTracking.ts` and `settleLeftoverClaims.ts` release running claims on failure. Those behaviors cannot be left unchanged when enabling recovery.
- The current page timeout abandons a promise; it does not stop SQL or a provider request. Failing claims while that work continues is unsafe. The timeout/stall tests explicitly exercise late completions.
- `queueMigrationWebhooks.ts` already sends batches of 500 records to a separate Trigger queue. It returns after enqueue. The migration senders count/log individual failures; `sendSvixEvent` also suppresses errors. Enqueue and these success counts do not prove Svix acceptance.
- Trigger retries a failed task from its beginning. Checkpoints at supported waits and keyed child results do not automatically save each ordinary page function. Verified in the existing development experiment and [Trigger's execution documentation](https://trigger.dev/docs/how-it-works#durable-execution).
- The existing version-filter reproduction fails because a fresh run cannot select customers already moved from v1 to v2. SQL receipts alone do not fix discovery, claims, completion or retention.

Relevant sources: `server/src/internal/migrations/v2/batchOperations/execute/`, `server/src/internal/migrations/v2/actions/migrationRun/`, `server/src/internal/migrations/v2/webhookDelivery/`; tests under `server/tests/integration/billing/migrations-v2/batch-migrations/recovery/` and `server/tests/unit/migrations-v2/batch-operations/`.

## Why this boundary

| Approach | Assessment |
|---|---|
| A child task per page | Trigger preserves page inputs, but adds a scheduling boundary per page and parent/child lifetime handling. Conflicts with the intended chunk batching. |
| Fixed customer list in chunk payload | Attractive in isolation, but preselects up to 100,000 customers, changes page-scoped claims and deadline yields, and still needs a durable discovery path for fresh-run repair. Not recommended for this change. |
| Saved page inside existing chunk | Adds an atomic claim result and discovery metadata; preserves the current page selection, bounded transactions, feature concurrency and chunk yielding. Recommended. |
| Local retries only | Already present for cache invalidation; cannot recover a dead worker or repair a later run that misses v2 customers. Insufficient for the agreed scope. |

Full chunk customer records can also approach Trigger's [10 MB payload limit](https://trigger.dev/docs/triggering#large-payloads). IDs alone are smaller, so this is a sizing constraint, not a claim that fixed-ID payloads are impossible.

## The durable data, explicitly

Reuse and reshape the prototype `migration_batch_results` table. This is an actual schema change to that prototype, not a claim that its current opaque `batch_id/input/result` shape is sufficient. Keep an indexed association to migration, original run, chunk and page; distinguish chunk completion, page, SQL-result and webhook-batch records. Persist customer-claim association to the recovery page so cleanup and ownership transfer can target it without scanning JSON or parsing batch IDs. That may add a nullable page reference/index to the existing `migration_item_runs` table; it does not require another table.

| Record | Retained information |
|---|---|
| Chunk | Immutable source identity and durable closed summary/cursor/counts; guards old replay after cleanup |
| Page | Original customer identities/required preview fields, selected count, incoming/outgoing cursor, fixed effective time, normalized prepared plan and webhook policy, current owner, completion summary |
| SQL batch | Original page/operation/cursor identity, schema version and canonical input hash, compact original changed-row facts and next cursor/count |
| Webhook batch | Stable original dispatch identity, selected event types/application, immutable lean record membership, first-attempt time, confirmed acceptance time |

The original plan and relevant feature definitions are stored once per saved page, not repeated in every SQL batch. Existing webhook and Tinybird builders need those frozen definitions as well as the original changed-row facts. The hash only validates execution inputs; it cannot reconstruct them. It must cover normalized schema version, original execution identity, plan/page contents, operation, effective time, cursor and batch size. Object-key order is canonicalized; array order stays significant. Hashing happens outside the hot SQL transaction where possible.

For SQL results, retain named objects: a `defaults` object for batch-wide facts plus named row-specific values/overrides. Replace the candidate-ID array with `selectedCount` and `nextCursor`; preserve actual changed-row identities and before-state needed for recovery and original billing diffs. No tuple encoding or abbreviated cryptic fields. The public page result remains the existing readable shape after decoding.

All SQL result save/reuse stays in `withMigrationBatchResult`. Page claim/completion belongs to the page orchestrator; webhook acceptance belongs to the sender. Do not run network calls inside the SQL helper or force those different semantics through one generic callback wrapper.

Compact result types and conversions live together under `execute/recovery/compactResults/`. Migration actions keep returning their existing full result types; this recovery layer owns converting to storage and restoring the original result. Add and repoint now supply typed `toStored`/`fromStored` conversions to `withMigrationBatchResult`. Fresh SQL and compact results commit together; saved results are decoded only on replay. Version 2 denotes converted storage; earlier version-1 full results remain readable. Candidates, exclusions and repeated execution inputs are still preserved unchanged. Replacing candidates with count/cursor and moving shared inputs to the original page remain later work; the storage probe estimates below describe that proposed complete representation.

First-slice test matrix:

| Case | Assertion |
|---|---|
| Heterogeneous inserted rows | JSON encode/decode preserves identities, lifecycle dates/status, entity, zero/null/false, optional remaining, candidates and exclusions; input unchanged |
| Empty insert result | Empty results retain candidates/exclusions; conversions use typed inputs without runtime Zod parsing |
| 5,000 homogeneous inserted rows | Exact JSON round-trip with fewer serialized bytes; common values stored once |

## Recovery and ownership

1. **Claim:** assign a stable page key from original run, chunk identity and incoming cursor. In one short transaction, select/claim customers and save their original page. A failure commits both or neither. A replay returns that saved page rather than repeating the filter. Empty/advanced selections must retain the cursor result too.
2. **SQL:** use the original page identity for every bounded transaction, including when another execution resumes it. Preserve current per-feature concurrency and candidate batch size. Same-identity concurrent attempts reuse the winning committed result.
3. **Effects:** rebuild original billing changes from the saved SQL results; invalidate caches and dispatch the existing bounded webhook tasks. Effects may overlap later pages using bounded in-flight work. That bound includes cache completion and Svix acknowledgement, not merely enqueue. Finalize each page promptly; drain all required effects for this chunk before returning its cursor. Queue acceptance is not page completion.
4. **Completion:** after required cache work and all required webhook-batch acknowledgements, atomically mark page complete and settle its customer claims. Save cursor/count summary for a chunk retry. Do not mark success inside SQL execution on the recovery-enabled path.
5. **Retry:** Trigger restarts the chunk with the same chunk input. Walk saved pages first: completed pages supply summaries, unfinished pages resume. Aggregate counts from those summaries exactly once per attempt. Only then claim more customers. After all pages/effects in this chunk complete, save its closed summary before returning to the parent; retries of a closed chunk return that summary. Chunk retries may be enabled after this protocol is proven; parent run retries remain disabled initially.

Work identity and current claim owner are different. A new execution may take ownership of a saved page only after the old executing task is confirmed stopped; its SQL and webhook keys still use the original identity. The owner identifies the executing attempt, not just the migration run. Verify ownership/closed state inside each mutation transaction: shared locks on the source chunk/page permit concurrent feature batches; exclusive locks serialize ownership transfer, completion and pruning. Check the actual attempt owner before executing any SQL. A top-level check alone is insufficient: an abandoned worker could otherwise write after cleanup.

Keep unresolved recovery-page customer claims protected. Existing terminal cleanup must not blindly release them. The existing live-item mutex then prevents another migration from modifying the same customers before recovery is resolved. Completed claims are released promptly. This is a deliberate failure-state tradeoff: an unresolved page remains visible and needs repair; it must not silently become selectable by an unrelated migration.

The first automatic recovery route is retrying the same chunk. The explicit fresh-run/retry route first discovers unfinished pages by indexed original ownership, before applying the current filter or preparing new work. It resumes original approved work with original identities, then continues fresh selection. Normal fresh SQL work gets new identities. Scope controls (`only`, limits, skipped/failed selection) must not silently authorize uncommitted old SQL outside the requested scope: incompatible partial-page requests return an explicit resume-original-page outcome. Repair of already-committed effects is attributed to its original execution, separately from new-work counts.

No promise of recovering historical runs that never recorded their original changes. Those require reconciliation; guessing old webhook diffs from current rows is not safe.

## Timeouts and cancellation

For recovery-enabled work, an outer timeout must not release ownership while an underlying mutation remains alive. Prefer the existing bounded database statements, cancellation-aware operations and Trigger's task lifetime. If a database connection is unresponsive, terminate/cancel it and establish that execution stopped before ownership transfer. Do not add another in-process retry around an abandoned operation.

Cooperative cancellation stops new claims and drains already-started work where possible. Hard cancellation must account for the active chunk and delivery tasks, not merely the parent handle. Preserve unfinished page records/claims after cancellation; never equate a terminal Trigger status or `finished_at` with completed side effects. Recovery preserves the original identity and must respect a canceled execution's explicit resume authorization.

## Webhook acceptance without slowing the mutation path

Reuse `sendMigrationWebhooksTask`, its 500-record batches, per-run queue and configured concurrency. No provider calls inside SQL transactions and no per-message SQL acknowledgement writes. Preserve bounded page/effect overlap; settle completed pages as their effects finish and drain this chunk before returning its cursor. Reported completion can take longer because it now includes actual acceptance. It is not honest to promise zero throughput/API impact before measuring.

Resolve webhook policy strictly too: explicit off or a successful subscription lookup may select zero required events; a lookup error must throw/retry, never silently become an empty subscription list. Make migration submission strict without changing unrelated best-effort webhook callers. A required message either receives a real Svix acknowledgement or leaves its batch unresolved and causes a retryable failure. Finish healthy records in the batch and surface failed records afterwards; do not silently count missing source objects as delivered.

Use stable event identities from original dispatch + event type + customer/entity/product scope. Persist one batch acknowledgement after all its required messages are accepted. On partial acceptance, reconcile the same event IDs; already-acknowledged batches skip provider calls. Persist the first attempt time before the first send so a crash cannot reset the ambiguity window. Delivery tasks must check the source closed marker before provider calls, so a manually replayed old delivery task cannot refire after cleanup.

Svix's [idempotency key guarantee](https://docs.svix.com/idempotency) is up to 12 hours with the same auth token; event-ID uniqueness is also bounded (one day in the installed SDK contract). A found message can prove acceptance. After provider guarantees expire, a missing message cannot prove it was never accepted: leave the batch unresolved for explicit reconciliation/resend, rather than silently duplicate it. Indefinite exactly-once submission cannot be guaranteed by either Trigger or this journal.

`billing.updated` preserves the original changes. Keep `customer.products.updated` as its existing current-state refresh, rebuilt at delivery time from lean IDs; do not invent historical full-customer snapshots. A stable event identity represents that required refresh, even if current data has subsequently changed. Missing data is an explicit unresolved/superseded result, not success.

Customer endpoint failures are Svix delivery/replay concerns after acceptance. Provider [payload retention](https://docs.svix.com/retention) is configurable; do not promise indefinite provider lookup or replay.

## Storage: measured, not assumed cheap

Synthetic probes ran against the verified isolated worktree Neon branch, PostgreSQL 18.6 with `pglz`. All probe tables were rolled back. Decimal MB; one customer product per customer, homogeneous active lifecycle defaults, randomized IDs. These are representation probes, not full migration benchmarks.

| 5,000 customers | JSON input + result | Table/index/TOAST space | Receipt write-ahead log |
|---|---:|---:|---:|
| Current one add + repoint | 3.42 MB | 1.32 MB | Not measured |
| Compact one add + repoint | 1.41 MB | 0.76 MB | Not measured |
| Current ten adds + repoint | 22.43 MB | 7.71 MB | 7.91 MB |
| Compact ten adds + repoint | 7.76 MB | 3.94 MB | 4.00 MB |
| Saved page: 5,000 identity pairs + cursor/time | 0.47 MB | 0.38 MB | 0.34 MB |

The compact ten-add results plus identity snapshot are about 4.32 MB/page; 100,000 similar customers are about 86 MB, one million about 864 MB while retained. This excludes the real prepared-plan/preview-field payload, webhook records/acknowledgements and recovery metadata. Heterogeneous lifecycles and many products per customer increase size. WAL measurements exclude domain mutations, DDL and commit records and depend on checkpoint/compression conditions.

Evidence: `/tmp/zagreb-receipt-storage.ts`, `/tmp/zagreb-receipt-storage.log`, `/tmp/zagreb-receipt-wal.ts`, `/tmp/zagreb-receipt-wal.log`. The elapsed probe times include serialization/network and must not be presented as migration latency predictions.

**Retention is part of correctness:** prune bulky results after the source chunk is fully finalized and no attempt can use them, retaining its small durable completion summary/closed marker. This avoids retaining all successful chunks until a long migration finishes. Every retry/manual entry and every mutation transaction must honor that marker, synchronized with pruning. An absent expired result must never become permission to execute old SQL again. Failed/canceled partial work is not eligible for deletion.

Initial cleanup should operate on fully resolved chunks, not individual SQL batches. Closing a chunk requires every saved page and required webhook batch to be complete. A failed/canceled origin run can still contain closed chunks that are safe to prune; its unfinished chunks remain protected. No seven-day retention of all bulky successful payloads is required for recovery; a short debugging grace period is a policy choice. Cleanup must batch deletes and measure vacuum/TOAST behavior; deleting rows is not a promise of immediately shrinking allocated disk.

Unresolved work is not bounded by age. Therefore rollout needs an explicit storage admission budget, tracking outstanding bytes/pages and cleanup lag. Reserve capacity before accepting another page; if there is insufficient capacity, finalize already-started pages and close/yield the current chunk before claiming more. Cleanup then permits the next chunk to proceed. Do not create a budget deadlock by waiting for the entire migration to finish before reclaiming completed chunks. A page too large for the supported budget must be rejected before mutation, with customer-product fanout and selected operations included in the preflight. Final limits must be set from the complete production-shaped benchmark and available database headroom; no numerical storage or latency budget is claimed approved yet.

## Ordered implementation units

Each unit is a vertical behavior, then divided into 1–3 source-file review slices. Do not recreate the earlier sequence of disconnected helpers and tests presented as a working migration fix.

1. **Bounded storage and lifecycle contract.** Replace repeated inputs/candidates with the compact representation; add indexed original ownership and closed-state guard; test decoding original changes and pruning a closed chunk without reexecution. Include representative 5,000-customer size/write measurements and an enforceable admission-budget design. This unit does not enable retries.
2. **Original page and safe claim recovery.** Atomically save/claim a page inside the existing loop; recover a partially executed page after the filter changes; integrate owner fencing and timeout/cleanup handling. Prove same-task and explicit fresh-run recovery including scope controls. Keep automatic retries disabled until completion is truthful.
3. **Required effects and completion.** Make subscription resolution and existing webhook tasks strict with stable identities and batch acknowledgements; retain cache strictness/overlap; settle page and customer marks only after cache + Svix acceptance. Cover partial acceptance and expired ambiguity. This unit completes the end-to-end recovery protocol.
4. **Validate recovery and overhead.** Prove real Trigger crash/retry/cancel behavior across multiple pages and compare mutation throughput and API p95/p99 under concurrent load. Keep rollout disabled until the final cleanup unit and rollout gates pass.
5. **Scheduled cleanup and rollout.** Add a cron job that deletes bulky page/SQL/webhook results in bounded batches only for safely closed chunks, retaining their small durable closed summaries. Preserve unfinished work regardless of age; test old SQL and delivery-task replay after cleanup. Measure cleanup lag and vacuum/TOAST behavior before enabling supported add/repoint retries behind rollout controls. Extend remove/replace/license operations separately; per-customer/Stripe recovery and Redis-stall root cause remain later work.

Rollout gates: every matrix case below passes; measurable storage cap and cleanup behavior; no unapproved p95/p99 regression; no new per-page task starts; supported operations explicitly gated. Only add/repoint currently have SQL receipt coverage. Unsupported operations keep existing behavior and must not be silently put on the new retry path.

## Failure matrix / acceptance checks

| Failure or action | Required behavior |
|---|---|
| Claim crashes before commit | Neither claim nor page snapshot survives |
| Claim commits, worker dies before SQL | Retry loads the same customers, cursor and timestamp |
| SQL batches 1–5 commit, batch 6 fails | Reuse 1–5 results; execute 6 onward; original results preserved |
| Repoint commits v1→v2, cache fails | Original page still found without the v1 filter; cache repaired |
| SQL/page result lost | Atomic SQL receipt supplies original changes |
| Worker dies after page complete | Retry uses saved summary/cursor; counts/effects not repeated |
| Partial Svix acceptance or response lost | Same message identities reconciled; incomplete batch cannot succeed |
| Subscription lookup fails | Retry policy resolution; never freeze an accidental no-webhooks decision |
| Queue enqueue succeeds but provider fails | Page/run stays incomplete; Trigger submission is not acceptance |
| Old acceptance ambiguous beyond provider window | Explicit unresolved state; no blind automatic resend |
| Fresh run after terminal failure | Discover original unfinished work before filter; preserve work identity |
| Retry skipped/failed or with only/limit | Preserve control semantics; no silent out-of-scope uncommitted work |
| Old worker continues during retry/cleanup | Transactional ownership/closed-state guard blocks stale SQL |
| Cancel parent with active chunk/deliveries | Confirm executor lifetime; retain unresolved work and ownership |
| Receipt cleanup followed by old SQL or delivery-task replay | Closed summary returned/replay rejected; no SQL mutation or provider resend |
| Storage budget exhausted | Stop new claims, drain existing work, preserve unresolved receipts |
| Healthy many-page run | Same chunk/page and feature concurrency; bounded effects; measured overhead |

## What exists today

Compact add and repoint results are wired into the existing SQL recovery helper. Their conversions and types live under `execute/recovery/compactResults/`; `resultStorage` supplies the two conversions without another execution wrapper. Actions and finalizers continue using full results. The helper returns fresh SQL results directly, saves compact results in the same transaction, and restores saved results on retry. It also reads earlier full-result records. Runtime Zod parsing has been removed from this SQL save/reuse path; typed inputs remain required. The isolated Trigger probe was adjusted to the new helper signature but was not rerun. The cleanup cron remains the final unit and is not implemented yet.

Compact-wiring verification: 11 focused tests pass (99 assertions), covering lossless add/repoint conversions, smaller 5,000-row JSON/JSONB representations, actual compact records after interrupted add/repoint execution, legacy reads, unknown-version rejection, concurrent attempts, conversion rollback, and resuming at batch 6 after five commits. Server typecheck and scoped Biome checks pass. Evidence: `/tmp/zagreb-compact-wiring-{unit,storage,page,batches,types}.log`; test matrix: `/tmp/zagreb-compact-wiring-checks.md`. The size checks measure result representations, not full migration storage or API latency. Candidates and repeated inputs remain to be reduced with original-page storage.

Keep the baseline reproductions, real Trigger boundary experiments, atomic SQL result helper and add/repoint recovery tests as evidence/prototypes. Production run/chunk retry settings remain at one attempt. No production caller supplies the page recovery input.

Removed the unused `runBatchMigrationPageTask`, its payload and runner. The cache recovery test now directly calls `executeBatchMigrationPage` followed by `invalidateBatchMigrationCaches`; it manually retries original serialized page inputs and does not claim to verify automatic chunk replay. No page task remains.

The restored direct SQL/cache proof passes (1 test, 25 assertions): after a forced Redis failure, manually retrying the original serialized page clears stale cache without repeating SQL. Evidence: `/tmp/zagreb-page-cache-cleanup.log`; server typecheck passes in `/tmp/zagreb-recovery-cleanup-types.log`. This supersedes the failed unused page-task fixture run; automatic chunk recovery is still not wired.

Prior plan preserved at `/tmp/zagreb-migration-recovery-plan-before-rpi.md`. This document supersedes it; it does not imply schema, claim, webhook, cleanup or retry wiring has already been implemented.
