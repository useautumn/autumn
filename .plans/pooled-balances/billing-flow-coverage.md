# Pooled balance billing-flow coverage

## Status and purpose

This is the parity contract for rebuilding pooled-balance billing flows from scratch.

- Reference implementation: feat/pooled-balances-billing-v2 at 7ef9bf086.
- Clean implementation branch: feat/pooled-balances-billing-rework.
- Scope: billing actions under server/src/internal/billing/v2, plus reset, cache, and balance-sync boundaries those actions depend on.
- Goal: preserve every valid business case without preserving the reference execution architecture.

The reference branch is evidence of intended behavior, not the target design. It mixed reads, computation, locks, transactions, and writes inside execution. Some paths were only scaffolded and had no callers or tests.

Status labels used below:

- Implemented: the reference emitted and executed a pooled mutation.
- Partial: code existed, but a lifecycle or integration boundary was incomplete.
- Unsupported: the reference intentionally rejected the case.
- Deferred: required for production correctness but explicitly left for later.
- Audit required: observed behavior must be confirmed rather than copied blindly.

## Target architecture

Every action retains the normal V2 pipeline:

~~~text
setup
  -> load customer, pools, contributions, owners, and balance state
compute
  -> produce the complete AutumnBillingPlan with explicit pooled writes
evaluate / execute Stripe
  -> resolve processor resources and IDs
execute Autumn
  -> mechanically apply already-computed writes
~~~

Required rules:

1. Setup performs every database read needed to decide pooled writes.
2. Compute is deterministic and performs no database reads.
3. Stripe evaluation may replace temporary owner IDs with real Stripe IDs.
4. Autumn execution does not rediscover contributions, choose pools, calculate deltas, or reload a FullSubject to rebalance.
5. executeAutumnBillingPlan stays one cohesive path. Pooled execution is one ordinary optional step, not a separate product/license lifecycle.
6. executeCustomerLicenseTransitions runs normally. Its pooled effects are prepared in setup/compute and included in the main pooled plan.
7. Pooled execution owns at most one transaction. Leaf executors open no nested transactions or locks.
8. One plan belongs to one internalCustomerId. Pooled execution does not group or iterate across customers.
9. Execution applies explicit inserts, updates, and deltas in stable order.
10. Cache/balance-sync correctness, documented in [balance-sync-correctness.md](./balance-sync-correctness.md), must return before production rollout.

## Domain model

### Source customer product

A source is an entity-attached customer product with at least one entitlement whose definition has pooled: true.

The source is not the shared balance. Its pooled source customer-entitlement rows retain lifecycle/reset metadata, but spendable fields are normalized:

- balance = 0
- adjustment = 0
- additional_balance = 0
- entities = null

A customer-level product with a pooled definition is not a source.

### Pool

A pooled_balances row identifies a shared grant for one customer and feature/reset configuration. It points to one synthetic customer-level customer_entitlements row, which is the spendable balance used for deductions.

Pool identity is:

~~~text
internal_customer_id
+ internal_feature_id
+ interval
+ interval_count
+ reset_cycle_anchor
+ reset_mode
+ rollover_signature
~~~

It excludes product, price, entitlement, entity, source product, and next_reset_at. Lifetime pools use null anchor/next reset and lazy reset mode.

### Contribution

A pooled_balance_contributions row connects one source entitlement to one pool. Stable source identity is source_customer_product_id plus source_entitlement_id.

It stores:

- current_contribution: grant currently minted into the pool.
- next_cycle_contribution: grant to mint after the next owner reset.
- effective_at: staged removal boundary, or null.
- stripe_subscription_id: paid recurring reset owner.
- customer_license_link_id: assigned-seat reset owner.
- neither owner: free/lazy contribution.

The pool has no entitlement_id or price_id identity. source_entitlement_id remains on the contribution because one product can contribute several pooled features and a patch may remove only one.

Whole-source removal affects all contributions under a source product. Single-contribution removal affects one source product plus entitlement. Reference removals zeroed or staged rows; they did not delete them.

## Cross-cutting invariants

### Classification and amounts

1. A pooled source requires pooled: true and an entity-attached product.
2. The synthetic pooled entitlement has no customer product.
3. Source and synthetic rows are managed rows, not ordinary independent grants.
4. Contributions are finite and non-negative.
5. Current contribution uses current quantity.
6. Next contribution uses upcoming_quantity when present, otherwise current quantity.
7. Product quantity, allowance, billing units, and options use the canonical starting-balance calculation.
8. One-off prepaid prices remain manual top-ups until pooled top-up semantics are explicitly designed.
9. Boolean, unlimited, or entity-allocated semantics cannot silently become a finite contribution.

### Reset ownership

Free sources use lazy reset. Reference anchor priority was requested anchor, billing start, outgoing pooled-source anchor, then customer creation time.

Paid recurring sources require a Stripe subscription owner. A new customer-product ID may be a temporary compute token, but Stripe execution replaces it before Autumn persistence. Under skipBillingChanges, an active paid source without an existing/supplied subscription is invalid.

License assignments use customer_license.link_id as reset owner and inherit the parent reset cycle.

A non-lifetime subscription-owned pool cannot contain contributions renewed by different subscriptions. The reference validated this during execution; the rebuild validates it during compute from setup data.

License and free contributions both used lazy reset mode. Confirm whether they may coalesce when every identity field matches.

### Balance and adjustment accounting

For an upsert or immediate removal:

~~~text
contribution_delta = desired_current - previous_current
pool.balance       += contribution_delta
pool.adjustment    += contribution_delta
~~~

Changing adjustment with grant preserves recorded usage.

For scheduled removal:

~~~text
current_contribution     remains unchanged
next_cycle_contribution  becomes 0
effective_at             becomes cycle end
pool delta               is 0 now
~~~

A restore only applies when effective_at equals the expected cancellation boundary, preventing an old uncancel from reviving newer state.

A transfer removes prior current contribution/adjustment from the old pool, adds desired current contribution/adjustment to the destination, moves the existing row, and checks its source identity and expected old pool.

### Usage carry and rebalance

Usage carry preserves known consumption when moving from a non-pooled grant or importing a flashed balance. Rebalance redistributes total feature usage across eligible customer-level numeric entitlements in Autumn deduction order.

Required behavior:

- Exclude normalized source rows.
- Include synthetic pools and ordinary customer-level numeric entitlements.
- Exclude boolean, unlimited, entity-scoped, and non-customer-scope rows.
- Respect reverse_deduction_order and status rules.
- Preserve total usage; only distribution changes.
- Exclude the outgoing/source product from usage carry to prevent double deduction.
- Reference reapplied usage for a new contribution or positive increase, not a non-positive existing update.
- Rebalance changes balance only; grant deltas change balance and adjustment.

Setup loads every eligible entitlement for affected features. Compute emits exact rebalance deltas. Execute never recomputes them.

### Plan composition

Reference named fields were removeSources, removeContributions, restoreSources, stageOwnerRemovals, restoreOwners, transferSources, and upsertSources. This is clearer than a discriminated operation list, but the entries still forced execution-time reads.

The rebuild should keep readable named fields while making contents execution-ready, separating:

- pool graphs to insert;
- source entitlement normalizations;
- contribution inserts;
- exact contribution updates/transfers;
- pooled entitlement grant deltas;
- rebalance balance deltas;
- affected features for cache handling.

No executor should require a pool lookup, contribution lookup, FullSubject load, or business calculation.

Reference merge keys were source product for whole-source changes, source product plus entitlement for contribution changes, license link for owner changes, and contribution ID for transfers. Later values won. The rebuild also rejects contradictory final writes.

## Required setup context

Each action loads only pooled state it can affect:

- canonical public/internal customer IDs;
- current, outgoing, incoming, scheduled, and assignment products;
- pooled source rows and definitions;
- pools for affected features and their synthetic entitlements;
- contributions for affected sources, pools, subscriptions, or license links;
- eligible customer-level numeric entitlements;
- balances, adjustments, cache versions, and reset metadata;
- status filters and deduction order;
- known Stripe IDs and anchors;
- license parents, links, seats, unused assignments, and definition transitions;
- one captured current timestamp.

Prefer one joined PooledBalanceBillingContext over repository reads scattered across compute helpers.

## Flow coverage

### A. Attach an entity plan

Reference: Implemented, with unsupported cases and missing cache/concurrency protection.

#### A1. Non-pooled attach

- Customer-level plans and entity plans without pooled entitlements follow existing attach behavior.
- Emit no pool graph, contribution, normalization, or rebalance writes.

#### A2. First immediate pooled source

- Initialize the incoming customer product normally.
- Calculate one contribution per pooled entitlement.
- Resolve free, subscription, or license reset policy.
- Reuse a matching pool from setup or compute a new graph.
- Normalize source entitlements.
- Insert/upsert contributions.
- Add current grants to the synthetic entitlement.
- Rebalance affected features.

A missing pool requires one custom pooled entitlement definition, one synthetic customer entitlement, one pooled balance row, and contribution rows.

#### A3. Immediate replacement

- Remove every outgoing source contribution immediately.
- Upsert every incoming pooled contribution.
- Expire/insert products through normal attach behavior.
- Net grant deltas before rebalance.
- If the outgoing same-feature grant was non-pooled, carry recorded usage.

#### A4. Add another entity to an existing pool

- Reuse only when every identity field matches.
- Add a contribution keyed by the new source product and entitlement.
- Increase balance and adjustment by its current contribution.
- Reject a conflicting Stripe owner.

#### A5. Idempotency

- Existing contribution for the same source identity is updated, not duplicated.
- Delta uses stored current contribution from setup.
- A contribution pointing to another pool requires explicit transfer.
- Concurrent creation must be conflict-safe, not an unguarded find-then-insert.

#### A6. Inactive and scheduled products

- Scheduled/inactive products mint no grant now.
- They may have prepared source rows, but activation later adds the contribution.
- The reference prepared scheduled rows but did not complete standalone activation: Partial.

#### A7. Unsupported cases

Reference returned 400 for:

- active pooled entity product starting in the future;
- pooled source with free trial or trial end;
- paid pooled product that is not paid recurring;
- active paid source under skipBillingChanges without subscription owner;
- non-finite or negative contribution;
- resetting paid/license source with incomplete reset dates.

Keep these rejections until each has an explicit lifecycle design.

#### A8. Processor safety

- Preview computes the same plan but writes nothing.
- Stripe failure leaves no Autumn pooled state.
- Actual subscription ID reaches product and contribution owner before persistence.

### B. Immediate multi-product attach

Reference: Implemented.

- Prepare every product independently.
- Merge pooled writes into one Autumn plan.
- Aggregate products affecting the same pool deterministically.
- Keep one internal customer.
- Preserve normal license transitions.

### C. Create schedule

Reference: Partial because activation/reset integration was incomplete.

#### C1. Immediate phase

- Expire selected current recurring products.
- Immediately remove all their pooled sources.
- Prepare every immediate product.
- Do not remove outgoing sources again inside per-product preparation.
- Merge removals/upserts once.

#### C2. Future phases

- Insert scheduled products with start/end and schedule linkage.
- Mint no contribution while inactive.
- Do not remove the active source merely because a future phase exists.
- At activation, atomically remove outgoing and add incoming contributions.

The activation behavior was not completed in the reference.

#### C3. Schedule replacement

- Delete/replace old scheduled products normally.
- Never-active products need no pooled removal.
- A contribution unexpectedly attached to a scheduled product is an invariant violation.

### D. Update subscription

#### D1. Recurring prepaid quantity

Reference: Implemented.

- Exclude one-off prepaid prices.
- Compute current/upcoming options normally.
- Suppress ordinary direct balance updates for pooled source rows.
- Recompute current and next contributions.
- Preserve identity/reset metadata.
- Require subscription owner and complete reset data.
- Apply contribution delta to balance/adjustment, then rebalance.
- Non-pooled siblings update normally.

#### D2. Manual top-up

Reference: no pooled-specific behavior.

- Keep the existing one-off purchase flow.
- Do not rewrite recurring contributions.
- Design credit ownership, expiry, and reset before pooled top-ups.

#### D2a. Update license quantity

Reference: no direct pooled-source mutation; license transition machinery handled definition changes.

- Changing the number of available seats changes customer-license granted/remaining state, not the contribution of an already assigned seat.
- Existing assigned-seat contributions remain unchanged when only availability changes.
- Adding or releasing an actual assignment is covered by the attach/release license flows.
- If the license product definition changes at the same time, use the customer-license definition transition coverage below.
- Existing validation must prevent a quantity reduction from silently orphaning assignments.

#### D3. Status or processor subscription ID

Reference: Implemented.

- No pooled plan when neither field changes.
- Inactive target status removes source immediately.
- Explicitly clearing an existing subscription removes source immediately.
- Active owned target re-upserts without removing first.
- Supplied processor ID patches contribution owners and product subscription IDs.
- Skip this extra plan when cancellation/replacement already owns lifecycle.

#### D4. Custom expire-and-insert

Reference: Implemented.

- Prepare new custom product like attach.
- Remove old/add new source for active update.
- Preserve price, entitlement, usage carry, line item, schedule, and license behavior.
- Replacing a scheduled row does not mutate an active pool.

#### D5. Patch in place

Reference: Implemented.

- Deleting one pooled entitlement removes only that contribution.
- Adding one prepares only that entitlement.
- Normalize inserted source rows.
- Scheduled products have no active contribution to remove.
- Leave unchanged siblings untouched.
- “New row” mode uses expire-and-insert.
- Same-row license transitions compare pristine original and final patched products.
- Anchor reset updates use the prepared product.

#### D6. Immediate cancellation

Reference: Implemented.

- Remove canceled source immediately.
- Prepare an immediate default pooled product without removing twice.
- Remove invalidated add-on sources only if active.
- Keep normal refund/Stripe behavior.

#### D7. End-of-cycle cancellation

Reference: staging Implemented; reset application Partial.

- Keep current contribution until boundary.
- Set next contribution to zero and effective_at to cycle end.
- Do not change current pool balance.
- Stage every seat contribution owned by license links on the parent.
- Scheduled default contributes only on activation.
- Reset/transition processing applies staged removal exactly once; reference did not wire this consumer.

#### D8. Uncancel

Reference: restoration Implemented, dependent on reset lifecycle.

- Restore only rows matching exact prior ended_at boundary.
- Restore license-owned rows by link with same comparison.
- Set next back to current and clear effective_at.
- Do not change current pool balance.
- Non-finite ended_at means no restore attempt.

#### D9. Cancel before billing starts

Reference: Implemented.

- Delete a scheduled/future-start product with schedule and no live subscription.
- It never contributed, so remove nothing.
- If this uncancels the current product in the same group, its contribution remains.

#### D10. Revert-trial cancellation

Reference: Implemented, although creating pooled trials was Unsupported.

- Do not create a default.
- Unpause the previous product.
- Re-upsert its active sources.
- Remove canceled product source if present.

#### D11. Billing-cycle anchor reset

Reference: Partial.

- Preserve ordinary reset metadata and line items.
- Keep source and synthetic reset data consistent.
- Changed non-lifetime anchor changes pool identity and may require transfer.
- Add an explicit decision/test rather than silently mutating identity.

### E. Stripe sync

Reference: immediate replacement and detection scope Implemented; future phases/concurrency Partial.

#### E1. Immediate replacement

- Same product with only license quantity drift updates license state without recreating parent source.
- Otherwise initialize from Stripe.
- Apply configured usage carry before pooled preparation.
- Remove old source, add new source, expire old product.
- Existing Stripe ID is required as reset owner.

#### E2. Prepaid drift detection

- Compare Stripe-derived totals with linked product prepaid state.
- Desired zero with zero purchased packs is not drift solely because catalog allowance is nonzero.
- Detect main and add-on drift.
- Replace with usage carry instead of directly overwriting source.

#### E3. Entity scope

- Preserve existing entity binding in generated sync params.
- Reject/skip ambiguous mappings.
- Never create customer-level duplicate for an entity-linked source.
- Infer removed add-ons only when Stripe detection has no unmatched items.

#### E4. Future phases

Required behavior:

- create inactive scheduled rows;
- preserve current source until its real boundary;
- transition sources during activation.

Audit required: reference sometimes expired and removed currentCustomerProduct while computing a future phase. Do not copy unless semantics prove it is obsolete now.

### F. DFU / flash

Reference: Implemented.

- Skip desired plan already represented by an active product.
- Build imported product with source status, processor, anchor, and balances.
- Prepare pooled sources as immediate attach.
- Convert imported used units into usage carry before normalization.
- Exclude flashed source while applying usage.
- Expire omitted active products only in payload-addressed customer/entity scopes.
- Remove sources for products expired by reconciliation.
- Leave non-addressed scopes untouched.
- Preserve mismatch reporting while enforcing reset-owner validation.

### G. Attach license seats

Reference: Implemented with execution/concurrency caveats.

- Resolve exactly one assignable parent/license pair.
- Reject missing, ambiguous, or archived target.
- Ignore entities already assigned under the link.
- Reuse released assignments before inserting new rows.
- Repoint reused rows and clear released_at.
- Insert missing entities before products.
- Initialize assignment from licensed definition.
- Anchor resets to parent cycle.
- Add one contribution per pooled assignment entitlement, owned by license link.
- Normalize source rows.
- Decrement remaining by newly assigned seats only.
- Keep one customer and one Autumn plan.

### H. Release license seats

Reference: Implemented.

- Mark assignment released normally.
- Immediately remove all its pooled contributions.
- Increment license remaining.
- Aggregate multiple releases in one customer plan.

### I. Customer-license definition transition

Reference: broad functional coverage, architecturally Partial.

The reference performed setup and compute inside executeCustomerLicenseTransitions. Move all of this earlier.

For every active assigned seat:

1. Initialize target assignment from incoming definition while retaining product ID and entity.
2. Match definitions through product transition map, then semantic equality.
3. Reject ambiguous entitlement/contribution matches.
4. Insert contribution when target pooled entitlement has no match.
5. Transfer existing contribution when definition or pool identity changes.
6. Verify expected old pool before transfer.
7. Remove unmatched old pooled contributions.
8. Insert missing target source rows.
9. Repoint existing rows when definition changes.
10. Restore ordinary balance/reset fields when pooled becomes non-pooled.
11. Apply customer-license row transition normally.
12. Trigger background seat transition only after synchronous commit.

Required redesign:

- Setup loads seats, pool graphs, contributions, parent, and transition map.
- Compute emits license changes, source-row writes, transfers/removals/upserts, and exact deltas.
- Main pooled execution applies them once.
- executeCustomerLicenseTransitions only applies normal prepared license changes.
- Batch dispatch remains post-commit.

### J. License-parent cancellation and restoration

Reference: staging Implemented; reset integration Partial.

- End-of-cycle parent cancellation stages every contribution owned by each license link.
- Uncancel restores only matching boundaries.
- Immediate parent cancellation transitions/removes seat contributions even though seats are separate products.
- Parent replacement preserving a link transfers/repoints ownership rather than stranding seats.
- Add end-to-end tests across parent, seat, pool, and reset state.

## Execution order

Reference order was roughly:

1. custom definitions;
2. plan-license definitions;
3. direct entitlement inserts/patches;
4. license quantity updates;
5. entities;
6. new products;
7. pooled mutations;
8. customer-license transitions;
9. schedule replacements;
10. product updates/deletes;
11. ordinary entitlement updates/rebalances;
12. subscription/invoice persistence.

The rebuild preserves dependencies without a second lifecycle path:

- source products/rows exist before contribution inserts;
- removals are computed from setup state before outgoing mutation/deletion;
- related normal and pooled writes commit atomically where practical;
- normal product/license execution is never skipped because pooled writes exist;
- absent pooled plan is a no-op;
- background dispatch happens post-commit.

Stable pooled write order:

1. insert missing synthetic entitlement/pool graphs;
2. normalize source rows;
3. insert/update/transfer/stage/restore contributions;
4. apply aggregated grant deltas;
5. apply precomputed usage-carry/rebalance deltas in stable entitlement-ID order;
6. commit;
7. perform cache cutover/invalidation.

## Reference gaps

### Pool resets

Reference: Partial / effectively unimplemented.

The repository exposed applyReset, owner lookups, next contributions, effective boundaries, and last_applied_reset_at, but no production caller applied pooled resets. The rebuild needs:

- lazy reset for free pools;
- subscription renewal reset by Stripe owner;
- license-parent reset by license link;
- current becoming next contribution;
- staged removal becoming zero at boundary;
- rollover and balance/adjustment reset;
- expected-next-reset compare-and-set;
- idempotency for duplicate webhooks/concurrent checks;
- cache cutover after reset.

Attach/cancel can come first, but scheduled cancellation is incomplete until this exists.

### Cache and stale sync

Reference: Deferred.

The old branch documented and partly implemented a customer-scoped sync lock, reusable transaction handle, and post-commit cache cutover. See [balance-sync-correctness.md](./balance-sync-correctness.md).

### Pool garbage collection

Reference: not implemented.

Zeroed contributions and empty pools remained. Decide whether history is permanent or cleanup is needed. Cleanup cannot break uncancel, auditability, or delayed reset processing.

### Automated tests

Reference: not implemented.

The reference commit added no pooled billing integration tests. Every case below is new required coverage.

## Test and acceptance matrix

### Attach

- PB-A01: first free entity source creates graph, normalized source, contribution, and balance.
- PB-A02: first paid source uses real post-Stripe subscription owner.
- PB-A03: second entity with identical identity joins existing pool.
- PB-A04: identity difference creates a distinct pool.
- PB-A05: repeated upsert does not duplicate contribution or grant.
- PB-A06: immediate replacement removes old and adds new in one result.
- PB-A07: non-pooled to pooled preserves usage.
- PB-A08: pooled to non-pooled does not infer usage from normalized zero.
- PB-A09: conflicting Stripe owner is rejected.
- PB-A10: customer-level pooled definition is not a source.
- PB-A11: future active start is rejected.
- PB-A12: free trial is rejected.
- PB-A13: paid non-recurring source is rejected.
- PB-A14: missing reset owner under skip-billing is rejected.
- PB-A15: negative, infinite, or NaN contribution is rejected.
- PB-A16: preview and Stripe failure write nothing.

### Multi-attach and schedules

- PB-S01: multiple immediate products aggregate correctly.
- PB-S02: immediate schedule phase removes all outgoing and adds all incoming once.
- PB-S03: future scheduled product mints no grant.
- PB-S04: activation atomically transitions source.
- PB-S05: deleting never-active schedule changes no balance.
- PB-S06: future phase creation does not remove current source early.

### Subscription updates

- PB-U01: quantity increase applies exact grant delta.
- PB-U02: quantity decrease preserves usage.
- PB-U03: upcoming quantity changes next but not current grant.
- PB-U04: one-off prepaid is excluded.
- PB-U05: non-pooled sibling updates normally.
- PB-U06: inactive status removes source.
- PB-U07: clearing subscription removes source.
- PB-U08: changing subscription reassigns owner without duplicate grant.
- PB-U09: custom replacement transitions sources.
- PB-U10: patch deletion removes selected contribution only.
- PB-U11: patch insertion adds and normalizes selected source only.
- PB-U12: scheduled patch removes no nonexistent active grant.
- PB-U13: immediate cancel removes now and prepares default correctly.
- PB-U14: end-of-cycle cancel stages without current balance change.
- PB-U15: uncancel restores exact boundary only.
- PB-U16: cancel-before-start has no pool mutation.
- PB-U17: revert-trial cancellation restores prior source.
- PB-U18: anchor reset keeps identity consistent or explicitly transfers.

### Sync and DFU

- PB-Y01: immediate sync replacement carries usage and transitions source.
- PB-Y02: license-only drift leaves parent contribution unchanged.
- PB-Y03: main/add-on prepaid drift is detected.
- PB-Y04: entity binding is preserved.
- PB-Y05: ambiguous entities do not create customer-level duplicate.
- PB-Y06: unmatched Stripe items do not cause false removal.
- PB-Y07: future sync phase does not remove current source early.
- PB-F01: flashed unused grant imports full contribution.
- PB-F02: flashed used grant reapplies imported usage once.
- PB-F03: already-active target is skipped.
- PB-F04: omitted product expires only in addressed scope and removes source.
- PB-F05: non-addressed scope remains untouched.

### Licenses

- PB-L01: new seat creates owned contributions and decrements remaining.
- PB-L02: reused seat repoints without duplicate contribution.
- PB-L03: duplicate entity request is idempotent.
- PB-L04: release removes source and increments remaining.
- PB-L05: license definition adds pooled entitlement.
- PB-L06: definition removes one pooled entitlement.
- PB-L07: identity change transfers contribution.
- PB-L08: pooled to non-pooled restores ordinary source balance.
- PB-L09: ambiguous matching fails before writes.
- PB-L10: stale expected pool fails transfer before writes.
- PB-L11: parent end-of-cycle cancel stages every owned seat.
- PB-L12: parent uncancel restores matching staged seats.
- PB-L13: batch workflow dispatches only after commit.

### Accounting, reset, and concurrency

- PB-R01: grant delta changes balance/adjustment; rebalance changes balance only.
- PB-R02: total usage is invariant through rebalance.
- PB-R03: normal and reverse deduction order distribute correctly.
- PB-R04: source/boolean/unlimited/entity rows are excluded.
- PB-R05: free lazy reset applies next contributions once.
- PB-R06: subscription renewal resets only owned pools.
- PB-R07: license reset applies only owned contributions.
- PB-R08: staged removal becomes zero at boundary.
- PB-R09: duplicate reset is a compare-and-set no-op.
- PB-C01: concurrent creation yields one pool and one contribution per source.
- PB-C02: concurrent attach/quantity update loses no delta.
- PB-C03: stale transfer fails expected-pool check.
- PB-C04: rollback leaves all related Autumn state unchanged.
- PB-C05: stale Redis cannot overwrite pooled transition.
- PB-C06: concurrent usage is neither lost nor duplicated.
- PB-C07: different customers do not block each other.

## Recommended implementation sequence

### Phase 1: attach setup and plan types

- Add joined pool setup context.
- Define execution-ready named plan fields.
- Implement pure identity, contribution, delta, normalization, usage carry, and rebalance helpers.
- Support first attach, joining an existing pool, and immediate replacement.
- Preserve unsupported errors.

### Phase 2: mechanical executor

- Apply explicit graph, contribution, and entitlement writes.
- Use one transaction and no nested executor transactions.
- Call once from cohesive executeAutumnBillingPlan.
- Keep normal product/license execution unconditional.

### Phase 3: attach variants

- Immediate multi-product.
- Schedule immediate phase.
- Scheduled preparation, explicitly tracking activation if out of scope.

### Phase 4: subscription mutations

- Quantity/upcoming quantity.
- Field changes.
- Custom replacement and patch.
- Immediate cancel, staged cancel, uncancel, and revert trial.
- Anchor reset/transfer decision.

### Phase 5: reconciliation

- Sync immediate/future.
- DFU/flash.
- Entity scope and usage carry.

### Phase 6: licenses

- Attach/reuse/release seat.
- Move transition setup/compute out of execution.
- Add/remove/transfer and pooled-to-non-pooled restoration.
- Parent owner staging/restoration.

### Phase 7: reset and cache correctness

- Implement free/subscription/license resets.
- Restore balance-sync serialization and post-commit cache strategy.
- Add race tests.

## Definition of done

- Every applicable matrix case is green.
- Every reference behavior is preserved or deliberately changed here.
- Every Audit required item has a recorded decision.
- Setup owns reads, compute owns decisions, execute owns writes.
- executeAutumnBillingPlan has one lifecycle path.
- License transitions are not prepared inside execution.
- No leaf pooled executor opens a transaction or lock.
- Scheduled cancellation has a real reset consumer.
- Cache/balance-sync correctness is restored.
- Preview, Stripe failure, and DB rollback are side-effect safe.
- Logs expose pool/source IDs and deltas without runtime recomputation.
